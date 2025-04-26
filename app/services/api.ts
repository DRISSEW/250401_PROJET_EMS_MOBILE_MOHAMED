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
  if (!options.signal) {
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    options.signal = controller.signal;
    
    try {
      const response = await fetch(url, options);
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  } else {
    // If signal is already provided, use it without timeout
    return fetch(url, options);
  }
};

/**
 * Process data in background using Promise and setTimeout
 * This moves heavy computation off the main thread
 */
const processDataInBackground = <T, U>(
  data: T,
  processingFunction: (data: T) => U
): Promise<U> => {
  return new Promise((resolve) => {
    setTimeout(() => {
      const processedData = processingFunction(data);
      resolve(processedData);
    }, 0);
  });
};

/**
 * Fetching List of Feeds
 */
export const fetchFeeds = async (apiKey: string): Promise<Feed[]> => {
  try {
    const url = `${BASE_URL}feed/list.json?apikey=${apiKey}`;
    const response = await fetchWithTimeout(`${PROXY_URL}${encodeURIComponent(url)}`);
    
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    const data = await response.json() as ProxyResponse;
    
    // Process feed data in background
    return await processDataInBackground(
      data.contents,
      (contents) => JSON.parse(contents)
    );
  } catch (error: any) {
    throw new Error(`Error loading feeds: ${error.message}`);
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
    console.log(`Fetching data for feed ${feedId} with time range ${hours} hours`);
    
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
    
    console.log(`Using interval: ${calculatedInterval} seconds for time range ${hours} hours`);
    
    const url = `${BASE_URL}feed/data.json?id=${feedId}&start=${startMs}&end=${endMs}&interval=${calculatedInterval}&skipmissing=1&limitinterval=1&apikey=${apiKey}`;
    console.log(`API URL: ${url}`);
    
    // Increase timeout for larger time ranges
    const timeoutMs = hours > 24 * 30 ? 60000 : 30000; // 60 seconds for month+ ranges, 30 seconds otherwise
    
    const options: RequestInit = signal ? { signal } : {};
    
    // Add retry logic for server errors
    let retries = 3;
    let lastError: Error | null = null;
    
    while (retries > 0) {
      try {
        const response = await fetchWithTimeout(`${PROXY_URL}${encodeURIComponent(url)}`, options, timeoutMs);
        
        if (!response.ok) {
          // If we get a 500 error, retry
          if (response.status === 500) {
            retries--;
            if (retries > 0) {
              console.log(`Server error (500), retrying... (${retries} attempts left)`);
              // Wait before retrying (exponential backoff)
              await new Promise(resolve => setTimeout(resolve, (3 - retries) * 1000));
              continue;
            }
          }
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        const responseData = await response.json() as ProxyResponse;
        console.log(`API response status: ${responseData.status.http_code}, content length: ${responseData.status.content_length}`);

        // Use background processing for JSON parsing and data transformation
        return await processDataInBackground(
          responseData.contents,
          (contents) => {
            const data = JSON.parse(contents);
            let processedData: { timestamp: number; value: number }[] = [];
            
            console.log(`Parsed data type: ${typeof data}, isArray: ${Array.isArray(data)}`);
            
            // Process different possible data formats
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
            
            console.log(`Processed ${processedData.length} data points`);
            
            if (processedData.length === 0) {
              console.warn('No data points found in the response');
              // Return empty data instead of throwing error
              return {
                chartData: { labels: [], values: [] },
                stats: { mean: 0, min: 0, max: 0, total: 0 }
              };
            }
            
            // Sort data by timestamp
            processedData.sort((a, b) => a.timestamp - b.timestamp);
            
            // Process in batches to avoid long-running operations
            return processDataInChunks(processedData);
          }
        );
      } catch (err: any) {
        lastError = err;
        if (err.name === 'AbortError') {
          throw err; // Rethrow abort errors without modifying
        }
        
        // If we get a network error or server error, retry
        if (retries > 0) {
          retries--;
          console.log(`Error fetching data, retrying... (${retries} attempts left): ${err.message}`);
          // Wait before retrying (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, (3 - retries) * 1000));
          continue;
        }
        
        // If we've exhausted retries, break out of the loop
        break;
      }
    }
    
    // If we've exhausted retries, return empty data
    console.error(`Error loading data after retries: ${lastError?.message}`);
    return {
      chartData: { labels: [], values: [] },
      stats: { mean: 0, min: 0, max: 0, total: 0 }
    };
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw error; // Rethrow abort errors without modifying
    }
    console.error(`Error loading data: ${error.message}`);
    // Return empty data instead of throwing error
    return {
      chartData: { labels: [], values: [] },
      stats: { mean: 0, min: 0, max: 0, total: 0 }
    };
  }
};

/**
 * Process large datasets in smaller chunks to prevent UI blocking
 */
const processDataInChunks = (
  processedData: { timestamp: number; value: number }[]
): { chartData: ChartData; stats: Stats } => {
  // Filter out any NaN values before processing
  const validData = processedData.filter(item => 
    !isNaN(item.timestamp) && !isNaN(item.value)
  );
  
  console.log(`Processing ${validData.length} valid data points out of ${processedData.length} total`);
  
  if (validData.length === 0) {
    console.warn('No valid data points found after filtering');
    return {
      chartData: { labels: [], values: [] },
      stats: { mean: 0, min: 0, max: 0, total: 0 }
    };
  }
  
  // Prepare chart data
  const labels = validData.map(item => {
    const date = new Date(item.timestamp * 1000);
    return date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  });
  
  const values = validData.map(item => item.value);
  
  // Calculate stats with optimized methods and NaN handling
  const validValues = values.filter(v => !isNaN(v));
  
  if (validValues.length === 0) {
    console.warn('No valid numeric values found for statistics calculation');
    return {
      chartData: { labels, values },
      stats: { mean: 0, min: 0, max: 0, total: 0 }
    };
  }
  
  const sum = validValues.reduce((a, b) => a + b, 0);
  const stats = {
    mean: sum / validValues.length,
    min: Math.min(...validValues),
    max: Math.max(...validValues),
    total: sum
  };
  
  console.log('Calculated stats:', stats);
  
  return {
    chartData: { labels, values },
    stats
  };
};

/**
 * Optimized method for batch processing larger datasets
 * Can be used for future enhancements
 */
const batchProcess = <T, U>(
  items: T[],
  processingFunction: (batch: T[]) => U[],
  batchSize = 1000
): Promise<U[]> => {
  return new Promise((resolve) => {
    const result: U[] = [];
    let index = 0;
    
    function processNextBatch() {
      // Get the next batch
      const batch = items.slice(index, index + batchSize);
      index += batchSize;
      
      // Process this batch
      const batchResults = processingFunction(batch);
      result.push(...batchResults);
      
      // If there are more items, schedule next batch, otherwise resolve
      if (index < items.length) {
        setTimeout(processNextBatch, 0);
      } else {
        resolve(result);
      }
    }
    
    // Start processing
    processNextBatch();
  });
};