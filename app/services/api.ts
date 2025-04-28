import { Feed, ChartData, Stats } from '../types';

// Define the response type from the proxy API
interface ProxyResponse {
  contents: string;
  status: {
    url: string;
    content_type: string;
    http_code: number;
    response_time: number;
    content_length: number;
  };
}

/**
 * API Configuration
 */
const PROXY_URL = 'https://api.allorigins.win/get?url=';
const BASE_URL = 'http://electricwave.ma/energymonitoring/';

/**
 * Fetch with timeout and abort support
 */
const fetchWithTimeout = async (
  url: string,
  options: RequestInit = {},
  timeoutMs: number = 30000
): Promise<Response> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    console.log(`Attempting to fetch: ${url}`);
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        ...options.headers,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });
    clearTimeout(timeoutId);
    
    console.log(`Response status: ${response.status}`);
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`HTTP error! Status: ${response.status}, Response: ${errorText}`);
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    return response;
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Fetch error: ${errorMessage}`);
    throw error;
  }
};

/**
 * Process data in background to prevent UI blocking
 */
const processDataInBackground = async <T, R>(
  data: T,
  processor: (data: T) => R
): Promise<R> => {
  return new Promise((resolve) => {
    setTimeout(() => {
      const result = processor(data);
      resolve(result);
    }, 0);
  });
};

/**
 * Fetching List of Feeds
 */
export const fetchFeeds = async (apiKey: string): Promise<Feed[]> => {
  try {
    // Try direct request first
    try {
      const url = `${BASE_URL}feed/list.json?apikey=${apiKey}`;
      console.log('Attempting direct feed list request...');
      const response = await fetchWithTimeout(url);
      console.log('Direct feed list request successful');
      return await processDataInBackground(
        await response.json(),
        (contents) => contents
      );
    } catch (directError: unknown) {
      console.log('Direct feed list request failed, trying proxy');
      
      // If direct request fails, try proxy
      const url = `${BASE_URL}feed/list.json?apikey=${apiKey}`;
      const proxyUrl = `${PROXY_URL}${encodeURIComponent(url)}`;
      const response = await fetchWithTimeout(proxyUrl);
      
      const data = await response.json() as ProxyResponse;
      
      return await processDataInBackground(
        data.contents,
        (contents) => JSON.parse(contents)
      );
    }
  } catch (error: any) {
    console.error(`Error loading feeds: ${error.message}`);
    // Return empty array instead of throwing error
    return [];
  }
};

/**
 * Fetching Data for a Specific Feed
 */
export const fetchFeedData = async (
  feedId: string,
  hours: number,
  apiKey: string,
  interval?: number,
  signal?: AbortSignal
): Promise<{ chartData: ChartData; stats: Stats }> => {
  try {
    console.log(`Starting fetchFeedData for feed ${feedId}`);
    console.log(`Time range: ${hours} hours, API Key: ${apiKey ? 'Present' : 'Missing'}`);
    
    const now = Math.floor(Date.now() / 1000);
    const start = now - (hours * 3600);
    const startMs = start * 1000;
    const endMs = now * 1000;
    
    // Use provided interval or calculate based on time range
    let calculatedInterval = interval || 900; // Default 15 minutes if not provided
    
    if (!interval) {
      // Adjust interval based on time range to optimize data size
      if (hours > 24 * 30) {
        calculatedInterval = 86400; // 1 day for month+ ranges
      } else if (hours > 24 * 7) {
        calculatedInterval = 3600; // 1 hour for week+ ranges
      } else if (hours > 24) {
        calculatedInterval = 1800; // 30 minutes for day+ ranges
      }
    }
    
    console.log(`Using interval: ${calculatedInterval} seconds`);
    
    const url = `${BASE_URL}feed/data.json?id=${feedId}&start=${startMs}&end=${endMs}&interval=${calculatedInterval}&skipmissing=1&limitinterval=1&apikey=${apiKey}`;
    console.log(`Full API URL: ${url}`);
    
    // Increase timeout for larger time ranges
    const timeoutMs = hours > 24 * 30 ? 60000 : 30000;
    
    const options: RequestInit = {
      ...(signal ? { signal } : {}),
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    };
    
    // Add retry logic for server errors
    let retries = 3;
    let lastError: Error | null = null;
    
    while (retries > 0) {
      try {
        console.log(`Attempt ${4 - retries} of 3`);
        
        // Try direct request first with better error handling
        try {
          console.log('Attempting direct request...');
          const directResponse = await fetchWithTimeout(url, options, timeoutMs);
          const directData = await directResponse.json();
          console.log('Direct request successful');
          return processDataInBackground(directData, processFeedData);
        } catch (directError: unknown) {
          const errorMessage = directError instanceof Error ? directError.message : 'Unknown error';
          console.log('Direct request failed, trying proxy:', errorMessage);
          
          // If direct request fails, try proxy
          const proxyUrl = `${PROXY_URL}${encodeURIComponent(url)}`;
          console.log(`Attempting proxy request to: ${proxyUrl}`);
          
          const proxyResponse = await fetchWithTimeout(proxyUrl, options, timeoutMs);
          const proxyData = await proxyResponse.json() as ProxyResponse;
          
          console.log(`Proxy response status: ${proxyData.status.http_code}`);
          
          if (proxyData.status.http_code !== 200) {
            throw new Error(`Proxy error: ${proxyData.status.http_code}`);
          }
          
          console.log('Proxy request successful');
          return processDataInBackground(proxyData.contents, (contents) => {
            const data = JSON.parse(contents);
            return processFeedData(data);
          });
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        lastError = err instanceof Error ? err : new Error(errorMessage);
        console.error(`Request attempt failed: ${errorMessage}`);
        
        if (err instanceof Error && err.name === 'AbortError') {
          throw err; // Re-throw abort errors as they're intentional
        }
        
        if (retries > 1) {
          retries--;
          console.log(`Retrying... (${retries} attempts left)`);
          await new Promise(resolve => setTimeout(resolve, (3 - retries) * 1000));
          continue;
        }
        break;
      }
    }
    
    console.error(`All retry attempts failed. Last error: ${lastError?.message}`);
    return {
      chartData: { labels: [], values: [] },
      stats: { mean: 0, min: 0, max: 0, total: 0 }
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Fatal error in fetchFeedData: ${errorMessage}`);
    if (error instanceof Error && error.name === 'AbortError') {
      throw error; // Re-throw abort errors as they're intentional
    }
    return {
      chartData: { labels: [], values: [] },
      stats: { mean: 0, min: 0, max: 0, total: 0 }
    };
  }
};

/**
 * Fetch live value for a specific feed
 */
export const fetchFeedValue = async (
  feedId: string,
  apiKey: string
): Promise<number> => {
  try {
    // Try direct request first
    try {
      const url = `${BASE_URL}feed/value.json?id=${feedId}&apikey=${apiKey}`;
      const response = await fetchWithTimeout(url);
      const data = await response.json();
      return parseFloat(Number(data).toFixed(2)) || 0;
    } catch (directError) {
      // If direct request fails, try proxy
      const url = `${BASE_URL}feed/value.json?id=${feedId}&apikey=${apiKey}`;
      const proxyUrl = `${PROXY_URL}${encodeURIComponent(url)}`;
      const response = await fetchWithTimeout(proxyUrl);
      const proxyData = await response.json() as ProxyResponse;
      const data = JSON.parse(proxyData.contents);
      return parseFloat(Number(data).toFixed(2)) || 0;
    }
  } catch (error: any) {
    console.error(`Error fetching feed value for ${feedId}:`, error);
    return 0;
  }
};

/**
 * Fetch live values for multiple feeds
 */
export const fetchFeedValues = async (
  feedIds: string[],
  apiKey: string
): Promise<{ [key: string]: number }> => {
  try {
    const values: { [key: string]: number } = {};
    await Promise.all(
      feedIds.map(async (id) => {
        try {
          values[id] = await fetchFeedValue(id, apiKey);
        } catch (err) {
          console.error(`Error fetching value for feed ${id}:`, err);
          values[id] = 0;
        }
      })
    );
    return values;
  } catch (error: any) {
    console.error('Error fetching feed values:', error);
    return {};
  }
};

/**
 * Fetch historical data for multiple feeds
 */
export const fetchHistoricalData = async (
  feedIds: string[],
  hours: number,
  apiKey: string,
  interval?: number
): Promise<{ [key: string]: any[] }> => {
  try {
    const now = Math.floor(Date.now() / 1000);
    const startTime = now - (hours * 3600);
    const calculatedInterval = interval || getDefaultInterval(hours);
    
    const history: { [key: string]: any[] } = {};
    
    await Promise.all(
      feedIds.map(async (id) => {
        try {
          // Try direct request first
          try {
            const url = `${BASE_URL}feed/data.json?id=${id}&start=${startTime * 1000}&end=${now * 1000}&interval=${calculatedInterval}&apikey=${apiKey}`;
            const response = await fetchWithTimeout(url);
            const data = await response.json();
            history[id] = data.map((point: [number, number]) => ({
              value: point[1] || 0,
              timestamp: point[0] / 1000,
              date: new Date(point[0]).toISOString()
            }));
          } catch (directError) {
            // If direct request fails, try proxy
            const url = `${BASE_URL}feed/data.json?id=${id}&start=${startTime * 1000}&end=${now * 1000}&interval=${calculatedInterval}&apikey=${apiKey}`;
            const proxyUrl = `${PROXY_URL}${encodeURIComponent(url)}`;
            const response = await fetchWithTimeout(proxyUrl);
            const proxyData = await response.json() as ProxyResponse;
            const data = JSON.parse(proxyData.contents);
            history[id] = data.map((point: [number, number]) => ({
              value: point[1] || 0,
              timestamp: point[0] / 1000,
              date: new Date(point[0]).toISOString()
            }));
          }
        } catch (err) {
          console.error(`Error fetching historical data for ${id}:`, err);
          history[id] = [];
        }
      })
    );
    
    return history;
  } catch (error: any) {
    console.error('Error fetching historical data:', error);
    return {};
  }
};

/**
 * Helper function to get default interval based on time range
 */
const getDefaultInterval = (hours: number): number => {
  if (hours > 24 * 30) return 86400; // 1 day for month+ ranges
  if (hours > 24 * 7) return 3600; // 1 hour for week+ ranges
  if (hours > 24) return 1800; // 30 minutes for day+ ranges
  return 900; // 15 minutes default
};

/**
 * Helper function to process feed data
 */
const processFeedData = (data: any): { chartData: ChartData; stats: Stats } => {
  let processedData: { timestamp: number; value: number }[] = [];
  
  if (Array.isArray(data)) {
    processedData = data.map((item: any) => ({
      timestamp: parseInt(item[0]),
      value: parseFloat(item[1])
    }));
  } else if (data.data && Array.isArray(data.data)) {
    processedData = data.data.map((item: any) => ({
      timestamp: parseInt(item[0]),
      value: parseFloat(item[1])
    }));
  } else if (typeof data === 'object') {
    processedData = Object.entries(data).map(([timestamp, value]) => ({
      timestamp: parseInt(timestamp),
      value: parseFloat(value as string)
    }));
  }
  
  if (processedData.length === 0) {
    return {
      chartData: { labels: [], values: [] },
      stats: { mean: 0, min: 0, max: 0, total: 0 }
    };
  }
  
  processedData.sort((a, b) => a.timestamp - b.timestamp);
  return processDataInChunks(processedData);
};

/**
 * Helper function to process data in chunks
 */
const processDataInChunks = (data: { timestamp: number; value: number }[]): { chartData: ChartData; stats: Stats } => {
  const labels: string[] = [];
  const values: number[] = [];
  let total = 0;
  let min = Infinity;
  let max = -Infinity;
  
  data.forEach((item) => {
    const date = new Date(item.timestamp);
    labels.push(date.toLocaleTimeString());
    values.push(item.value);
    total += item.value;
    min = Math.min(min, item.value);
    max = Math.max(max, item.value);
  });
  
  return {
    chartData: { labels, values },
    stats: {
      mean: total / values.length,
      min,
      max,
      total
    }
  };
};