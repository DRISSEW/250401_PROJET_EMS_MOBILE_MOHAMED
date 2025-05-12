import { Feed, ChartData, Stats } from '../types';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Detect platform
const isReactNative = typeof navigator !== 'undefined' && navigator.product === 'ReactNative';

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

// Cache configuration
const CACHE_EXPIRY = {
  FEEDS: 30 * 60 * 1000, // 30 minutes
  FEED_DATA: 5 * 60 * 1000, // 5 minutes
  FEED_VALUE: 1000, // 1 minute
};

/**
 * API Configuration
 */
const PROXY_URL = 'https://api.allorigins.win/get?url=';
const BASE_URL = 'http://electricwave.ma/energymonitoring/';

/**
 * Enhanced fetch with timeout, retry and proper error handling for React Native
 */
const fetchWithTimeout = async (
  url: string,
  options: RequestInit = {},
  timeoutMs: number = 15000, // Reduced timeout for mobile
  retries: number = 2 // Default retry count
): Promise<Response> => {
  let lastError: Error | null = null;
  let attempts = retries + 1;
  
  while (attempts > 0) {
    try {
      if (isReactNative) {
        // React Native implementation with manual timeout
        const fetchPromise = new Promise<Response>((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            reject(new Error('Request timed out'));
          }, timeoutMs);
          
          fetch(url, options)
            .then(response => {
              clearTimeout(timeoutId);
              if (!response.ok) {
                response.text().then(text => {
                  reject(new Error(`HTTP error! Status: ${response.status}, Message: ${text.substring(0, 100)}`));
                }).catch(() => {
                  reject(new Error(`HTTP error! Status: ${response.status}`));
                });
              } else {
                resolve(response);
              }
            })
            .catch(error => {
              clearTimeout(timeoutId);
              reject(error);
            });
        });
        
        return await fetchPromise;
      } else {
        // Web implementation with AbortController
        const controller = new AbortController();
        const signal = options.signal || controller.signal;
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        
        try {
          const response = await fetch(url, {
            ...options,
            signal,
            headers: {
              ...options.headers,
              'Accept': 'application/json',
              'Content-Type': 'application/json',
            },
          });
          
          clearTimeout(timeoutId);
          
          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! Status: ${response.status}, Message: ${errorText.substring(0, 100)}`);
          }
          
          return response;
        } catch (error) {
          clearTimeout(timeoutId);
          throw error;
        }
      }
    } catch (error: unknown) {
      attempts--;
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempts > 0) {
        // Wait before retry, with exponential backoff
        await new Promise(resolve => setTimeout(resolve, (retries - attempts + 1) * 1000));
        continue;
      }
      break;
    }
  }
  
  throw lastError || new Error('Request failed after all retry attempts');
};

/**
 * Safe JSON parse with fallback
 */
const safeJsonParse = (text: string, fallback: any = null) => {
  try {
    return JSON.parse(text);
  } catch (e) {
    console.error('JSON parse error:', e);
    return fallback;
  }
};

/**
 * Process data in background to prevent UI blocking
 */
const processDataInBackground = async <T, R>(
  data: T,
  processor: (data: T) => R
): Promise<R> => {
  // For React Native, use InteractionManager if available
  if (isReactNative && (globalThis as any).InteractionManager) {
    return new Promise((resolve) => {
      (globalThis as any).InteractionManager.runAfterInteractions(() => {
        const result = processor(data);
        resolve(result);
      });
    });
  }
  
  // Fallback to setTimeout
  return new Promise((resolve) => {
    setTimeout(() => {
      const result = processor(data);
      resolve(result);
    }, 0);
  });
};

/**
 * Fetching List of Feeds with caching
 */
export const fetchFeeds = async (
  apiKey: string,
  forceRefresh: boolean = false
): Promise<Feed[]> => {
  const cacheKey = `feeds_${apiKey}`;
  
  // Try cache first unless force refresh is requested
  if (!forceRefresh) {
    try {
      const cachedData = await AsyncStorage.getItem(cacheKey);
      if (cachedData) {
        const { data, timestamp } = JSON.parse(cachedData);
        // Use cache if within expiry time
        if (Date.now() - timestamp < CACHE_EXPIRY.FEEDS) {
          console.log('Using cached feeds list');
          return data;
        }
      }
    } catch (e) {
      console.warn('Cache read error:', e);
    }
  }
  
  try {
    // Try direct request first with better error handling
    try {
      const url = `${BASE_URL}feed/list.json?apikey=${apiKey}`;
      console.log('Attempting direct feed list request...');
      const response = await fetchWithTimeout(url);
      const data = await response.json();
      
      // Save to cache
      try {
        await AsyncStorage.setItem(cacheKey, JSON.stringify({
          data,
          timestamp: Date.now()
        }));
      } catch (e) {
        console.warn('Cache write error:', e);
      }
      
      return data;
    } catch (directError: unknown) {
      console.log('Direct feed list request failed, trying proxy');
      
      // If direct request fails, try proxy with reduced timeout
      const url = `${BASE_URL}feed/list.json?apikey=${apiKey}`;
      const proxyUrl = `${PROXY_URL}${encodeURIComponent(url)}`;
      const response = await fetchWithTimeout(proxyUrl, {}, 10000);
      
      const proxyData = await response.json() as ProxyResponse;
      const data = safeJsonParse(proxyData.contents, []);
      
      // Save to cache
      try {
        await AsyncStorage.setItem(cacheKey, JSON.stringify({
          data,
          timestamp: Date.now()
        }));
      } catch (e) {
        console.warn('Cache write error:', e);
      }
      
      return data;
    }
  } catch (error: any) {
    console.error(`Error loading feeds: ${error.message}`);
    
    // Try to get potentially outdated data from cache as last resort
    try {
      const cachedData = await AsyncStorage.getItem(cacheKey);
      if (cachedData) {
        console.log('Using outdated cache due to fetch failure');
        return JSON.parse(cachedData).data;
      }
    } catch (e) {
      console.warn('Cache read error:', e);
    }
    
    // Return empty array as last resort
    return [];
  }
};

/**
 * Fetching Data for a Specific Feed with caching and better error handling
 */
export const fetchFeedData = async (
  feedId: string,
  hours: number,
  apiKey: string,
  interval?: number,
  signal?: AbortSignal,
  useCache: boolean = true
): Promise<{ chartData: ChartData; stats: Stats }> => {
  try {
    console.log(`Starting fetchFeedData for feed ${feedId}`);
    
    const cacheKey = `feed_${feedId}_${hours}_${interval || 'default'}`;
    
    // Try to get from cache first if not explicitly disabled
    if (useCache) {
      try {
        const cachedData = await AsyncStorage.getItem(cacheKey);
        if (cachedData) {
          const parsedCache = JSON.parse(cachedData);
          const cacheTime = parsedCache.timestamp || 0;
          // Use cache if less than configured expiry time
          if (Date.now() - cacheTime < CACHE_EXPIRY.FEED_DATA) {
            console.log('Using cached data for', feedId);
            return parsedCache.data;
          }
        }
      } catch (e) {
        console.warn('Cache read error:', e);
      }
    }
    
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
    console.log(`API URL: ${url}`);
    
    // Reduce timeout for mobile
    const timeoutMs = isReactNative ? 15000 : (hours > 24 * 30 ? 60000 : 30000);
    
    const options: RequestInit = {
      ...(signal ? { signal } : {}),
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    };
    
    let result: { chartData: ChartData; stats: Stats };
    
    // Try direct request first with better error handling
    try {
      console.log('Attempting direct request...');
      const directResponse = await fetchWithTimeout(url, options, timeoutMs);
      const directData = await directResponse.json();
      result = await processDataInBackground(directData, processFeedData);
    } catch (directError: unknown) {
      console.log('Direct request failed, trying proxy');
      
      // If direct request fails, try proxy
      const proxyUrl = `${PROXY_URL}${encodeURIComponent(url)}`;
      console.log(`Attempting proxy request`);
      
      const proxyResponse = await fetchWithTimeout(proxyUrl, options, timeoutMs);
      const proxyData = await proxyResponse.json() as ProxyResponse;
      
      if (proxyData.status.http_code !== 200) {
        throw new Error(`Proxy error: ${proxyData.status.http_code}`);
      }
      
      console.log('Proxy request successful');
      result = await processDataInBackground(proxyData.contents, (contents) => {
        const data = safeJsonParse(contents, []);
        return processFeedData(data);
      });
    }
    
    // Save successful result to cache
    if (useCache && result.chartData.values.length > 0) {
      try {
        await AsyncStorage.setItem(cacheKey, JSON.stringify({
          data: result,
          timestamp: Date.now()
        }));
      } catch (e) {
        console.warn('Cache write error:', e);
      }
    }
    
    return result;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Error in fetchFeedData: ${errorMessage}`);
    
    // If aborted, just propagate the error
    if (error instanceof Error && error.name === 'AbortError') {
      throw error;
    }
    
    // Try to get potentially outdated data from cache as last resort
    const cacheKey = `feed_${feedId}_${hours}_${interval || 'default'}`;
    try {
      const cachedData = await AsyncStorage.getItem(cacheKey);
      if (cachedData) {
        console.log('Using outdated cache due to fetch failure');
        return JSON.parse(cachedData).data;
      }
    } catch (e) {
      console.warn('Cache read error:', e);
    }
    
    // Return empty result as last resort
    return {
      chartData: { labels: [], values: [] },
      stats: { mean: 0, min: 0, max: 0, total: 0 }
    };
  }
};

/**
 * Fetch live value for a specific feed with caching
 */
export const fetchFeedValue = async (
  feedId: string,
  apiKey: string,
  useCache: boolean = true
): Promise<number> => {
  const cacheKey = `feed_value_${feedId}`;
  
  // Try cache first if not disabled
  if (useCache) {
    try {
      const cachedData = await AsyncStorage.getItem(cacheKey);
      if (cachedData) {
        const parsedCache = JSON.parse(cachedData);
        // Use cache if less than 1 minute old
        if (Date.now() - parsedCache.timestamp < CACHE_EXPIRY.FEED_VALUE) {
          return parsedCache.value;
        }
      }
    } catch (e) {
      console.warn('Cache read error:', e);
    }
  }
  
  try {
    // Try direct request first
    try {
      const url = `${BASE_URL}feed/value.json?id=${feedId}&apikey=${apiKey}`;
      const response = await fetchWithTimeout(url, {}, 10000);
      const data = await response.json();
      const value = parseFloat(Number(data).toFixed(2)) || 0;
      
      // Save to cache
      try {
        await AsyncStorage.setItem(cacheKey, JSON.stringify({
          value,
          timestamp: Date.now()
        }));
      } catch (e) {
        console.warn('Cache write error:', e);
      }
      
      return value;
    } catch (directError) {
      // If direct request fails, try proxy
      const url = `${BASE_URL}feed/value.json?id=${feedId}&apikey=${apiKey}`;
      const proxyUrl = `${PROXY_URL}${encodeURIComponent(url)}`;
      const response = await fetchWithTimeout(proxyUrl, {}, 10000);
      const proxyData = await response.json() as ProxyResponse;
      const data = safeJsonParse(proxyData.contents, 0);
      const value = parseFloat(Number(data).toFixed(2)) || 0;
      
      // Save to cache
      try {
        await AsyncStorage.setItem(cacheKey, JSON.stringify({
          value,
          timestamp: Date.now()
        }));
      } catch (e) {
        console.warn('Cache write error:', e);
      }
      
      return value;
    }
  } catch (error: any) {
    console.error(`Error fetching feed value for ${feedId}:`, error);
    
    // Try to get outdated value from cache as last resort
    try {
      const cachedData = await AsyncStorage.getItem(cacheKey);
      if (cachedData) {
        console.log('Using outdated cache due to fetch failure');
        return JSON.parse(cachedData).value;
      }
    } catch (e) {
      console.warn('Cache read error:', e);
    }
    
    return 0;
  }
};

/**
 * Fetch live values for multiple feeds with optimized requests and caching
 */
export const fetchFeedValues = async (
  feedIds: string[],
  apiKey: string
): Promise<{ [key: string]: number }> => {
  // Create a map to collect all values
  const values: { [key: string]: number } = {};
  
  // Split into smaller batches to prevent too many parallel requests
  const batchSize = 5;
  const batches = [];
  
  for (let i = 0; i < feedIds.length; i += batchSize) {
    batches.push(feedIds.slice(i, i + batchSize));
  }
  
  // Process batches sequentially to avoid overwhelming the device
  for (const batch of batches) {
    try {
      const batchResults = await Promise.all(
        batch.map(async (id) => {
          try {
            const value = await fetchFeedValue(id, apiKey);
            return { id, value };
          } catch (err) {
            console.error(`Error fetching value for feed ${id}:`, err);
            return { id, value: 0 };
          }
        })
      );
      
      // Add results to values map
      batchResults.forEach(({ id, value }) => {
        values[id] = value;
      });
      
      // Small delay between batches to prevent overwhelming the API
      if (batches.length > 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error) {
      console.error('Error processing batch:', error);
    }
  }
  
  return values;
};

/**
 * Fetch historical data for multiple feeds with optimized batching
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
    
    // Split into smaller batches to prevent too many parallel requests
    const batchSize = 3;
    const batches = [];
    
    for (let i = 0; i < feedIds.length; i += batchSize) {
      batches.push(feedIds.slice(i, i + batchSize));
    }
    
    // Process batches sequentially to avoid overwhelming the device
    for (const batch of batches) {
      try {
        const batchResults = await Promise.all(
          batch.map(async (id) => {
            const cacheKey = `history_${id}_${hours}_${calculatedInterval}`;
            
            // Try cache first
            try {
              const cachedData = await AsyncStorage.getItem(cacheKey);
              if (cachedData) {
                const parsedCache = JSON.parse(cachedData);
                // Use cache if less than configured expiry time
                if (Date.now() - parsedCache.timestamp < CACHE_EXPIRY.FEED_DATA) {
                  return { id, data: parsedCache.data };
                }
              }
            } catch (e) {
              console.warn('Cache read error:', e);
            }
            
            try {
              // Try direct request first
              try {
                const url = `${BASE_URL}feed/data.json?id=${id}&start=${startTime * 1000}&end=${now * 1000}&interval=${calculatedInterval}&apikey=${apiKey}`;
                const response = await fetchWithTimeout(url, {}, 15000);
                const data = await response.json();
                const processedData = data.map((point: [number, number]) => ({
                  value: point[1] || 0,
                  timestamp: point[0] / 1000,
                  date: new Date(point[0]).toISOString()
                }));
                
                // Save to cache
                try {
                  await AsyncStorage.setItem(cacheKey, JSON.stringify({
                    data: processedData,
                    timestamp: Date.now()
                  }));
                } catch (e) {
                  console.warn('Cache write error:', e);
                }
                
                return { id, data: processedData };
              } catch (directError) {
                // If direct request fails, try proxy
                const url = `${BASE_URL}feed/data.json?id=${id}&start=${startTime * 1000}&end=${now * 1000}&interval=${calculatedInterval}&apikey=${apiKey}`;
                const proxyUrl = `${PROXY_URL}${encodeURIComponent(url)}`;
                const response = await fetchWithTimeout(proxyUrl, {}, 15000);
                const proxyData = await response.json() as ProxyResponse;
                const data = safeJsonParse(proxyData.contents, []);
                const processedData = data.map((point: [number, number]) => ({
                  value: point[1] || 0,
                  timestamp: point[0] / 1000,
                  date: new Date(point[0]).toISOString()
                }));
                
                // Save to cache
                try {
                  await AsyncStorage.setItem(cacheKey, JSON.stringify({
                    data: processedData,
                    timestamp: Date.now()
                  }));
                } catch (e) {
                  console.warn('Cache write error:', e);
                }
                
                return { id, data: processedData };
              }
            } catch (err) {
              console.error(`Error fetching historical data for ${id}:`, err);
              
              // Try to get outdated data from cache as last resort
              try {
                const cachedData = await AsyncStorage.getItem(cacheKey);
                if (cachedData) {
                  console.log('Using outdated cache due to fetch failure');
                  return { id, data: JSON.parse(cachedData).data };
                }
              } catch (e) {
                console.warn('Cache read error:', e);
              }
              
              return { id, data: [] };
            }
          })
        );
        
        // Add results to history map
        batchResults.forEach(({ id, data }) => {
          history[id] = data;
        });
        
        // Small delay between batches to prevent overwhelming the API
        if (batches.length > 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) {
        console.error('Error processing history batch:', error);
      }
    }
    
    return history;
  } catch (error: any) {
    console.error('Error fetching historical data:', error);
    return {};
  }
};

/**
 * Clear cached data
 */
export const clearCache = async (type?: 'all' | 'feeds' | 'values' | 'data'): Promise<void> => {
  try {
    const keys = await AsyncStorage.getAllKeys();
    
    const keysToRemove = keys.filter(key => {
      if (!type || type === 'all') return true;
      if (type === 'feeds') return key.startsWith('feeds_');
      if (type === 'values') return key.startsWith('feed_value_');
      if (type === 'data') return key.startsWith('feed_') || key.startsWith('history_');
      return false;
    });
    
    if (keysToRemove.length > 0) {
      await AsyncStorage.multiRemove(keysToRemove);
      console.log(`Cleared ${keysToRemove.length} cache items`);
    }
  } catch (e) {
    console.error('Error clearing cache:', e);
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
 * Helper function to process feed data with chunking to prevent memory issues
 */
const processFeedData = (data: any): { chartData: ChartData; stats: Stats } => {
  let processedData: { timestamp: number; value: number }[] = [];
  
  // Safe data processing with type checks
  try {
    if (Array.isArray(data)) {
      // Process in chunks to avoid blocking UI
      const chunkSize = 500;
      for (let i = 0; i < data.length; i += chunkSize) {
        const chunk = data.slice(i, i + chunkSize);
        chunk.forEach((item: any) => {
          if (Array.isArray(item) && item.length >= 2) {
            const timestamp = parseInt(String(item[0]));
            const value = parseFloat(String(item[1]));
            
            if (!isNaN(timestamp) && !isNaN(value)) {
              processedData.push({ timestamp, value });
            }
          }
        });
      }
    } else if (data && data.data && Array.isArray(data.data)) {
      data.data.forEach((item: any) => {
        if (Array.isArray(item) && item.length >= 2) {
          processedData.push({
            timestamp: parseInt(String(item[0])),
            value: parseFloat(String(item[1]))
          });
        }
      });
    } else if (typeof data === 'object' && data !== null) {
      Object.entries(data).forEach(([timestampStr, value]) => {
        const timestamp = parseInt(timestampStr);
        const numValue = parseFloat(String(value));
        
        if (!isNaN(timestamp) && !isNaN(numValue)) {
          processedData.push({ timestamp, value: numValue });
        }
      });
    }
    
    // Sort data chronologically
    processedData.sort((a, b) => a.timestamp - b.timestamp);
    
    // Limit to maximum 1000 points to prevent rendering issues
    if (processedData.length > 1000) {
      const step = Math.ceil(processedData.length / 1000);
      processedData = processedData.filter((_, index) => index % step === 0);
    }
  } catch (error) {
    console.error('Error processing feed data:', error);
  }
  
  if (processedData.length === 0) {
    return {
      chartData: { labels: [], values: [] },
      stats: { mean: 0, min: 0, max: 0, total: 0 }
    };
  }
  
  return calculateStats(processedData);
};

/**
 * Helper function to calculate stats from processed data
 */
const calculateStats = (data: { timestamp: number; value: number }[]): { chartData: ChartData; stats: Stats } => {
  const labels: string[] = [];
  const values: number[] = [];
  let total = 0;
  let min = Infinity;
  let max = -Infinity;
  
  data.forEach((item) => {
    const date = new Date(item.timestamp);
    labels.push(formatTime(date));
    values.push(item.value);
    total += item.value;
    min = Math.min(min, item.value);
    max = Math.max(max, item.value);
  });
  
  return {
    chartData: { labels, values },
    stats: {
      mean: values.length > 0 ? total / values.length : 0,
      min: min !== Infinity ? min : 0,
      max: max !== -Infinity ? max : 0,
      total
    }
  };
};

/**
 * Helper function to format time appropriately
 */
const formatTime = (date: Date): string => {
  try {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    return date.toString();
  }
};

interface DailyConsumptionData {
  value: number;
  dataPointText: string;
  label: string;
  date: string;
}

// Profile-specific cache storage
const profileCaches: { [key: string]: {
  data: DailyConsumptionData[];
  timestamp: number;
}} = {};

const CACHE_DURATION = 3600000; // 1 hour in milliseconds

export const fetchDailyConsumptionData = async (feedId: string, apiKey: string, username: string): Promise<DailyConsumptionData[]> => {
  // Check if we have valid cached data for this profile
  const profileCache = profileCaches[username];
  const now = Date.now();
  
  if (profileCache && (now - profileCache.timestamp) < CACHE_DURATION) {
    console.log(`Using cached data for profile: ${username}`);
    return profileCache.data;
  }

  try {
    console.log(`Fetching fresh data for profile: ${username}`);
    // Calculate start time as one year ago
    const now = new Date();
    const oneYearAgo = now.getTime() - (365 * 24 * 60 * 60 * 1000);
    const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();

    const response = await fetch(
      `http://electricwave.ma/energymonitoring/feed/data.json?id=${feedId}&start=${oneYearAgo}&end=${firstDayOfMonth}&interval=86400&skipmissing=1&limitinterval=1&apikey=${apiKey}`
    );

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const processedData = processDailyConsumptionData(data);

    // Update the cache for this profile
    profileCaches[username] = {
      data: processedData,
      timestamp: now
    };

    return processedData;
  } catch (error) {
    console.error('Error fetching daily consumption data:', error);
    throw error;
  }
};

// Function to clear cache for a specific profile
export const clearProfileCache = (username: string) => {
  delete profileCaches[username];
  console.log(`Cleared cache for profile: ${username}`);
};

/**
 * Process daily consumption data from raw API response
 */
const processDailyConsumptionData = (data: any[]): DailyConsumptionData[] => {
  if (!Array.isArray(data) || data.length === 0) {
    console.log('Invalid or empty data received');
    return [];
  }

  const processedData: DailyConsumptionData[] = [];

  // Process each day's data
  for (let i = 1; i < data.length; i++) {
    const currentDay = data[i];
    const previousDay = data[i - 1];
    
    if (Array.isArray(currentDay) && Array.isArray(previousDay) && 
        currentDay.length >= 2 && previousDay.length >= 2) {
      
      const currentValue = Number(currentDay[1]);
      const previousValue = Number(previousDay[1]);
      const dailyConsumption = currentValue - previousValue;
      
      const date = new Date(currentDay[0]);
      
      processedData.push({
        value: dailyConsumption,
        dataPointText: dailyConsumption.toFixed(1),
        label: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        date: date.toISOString().split('T')[0]
      });
    }
  }

  console.log('Processed daily consumption data:', processedData);
  return processedData;
};