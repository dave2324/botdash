// Script to get YouTube video info using the YouTube Data API v3

// const fetch = require('node-fetch');

const VIDEO_INFO_URL = 'https://www.googleapis.com/youtube/v3/videos';
const API_KEY = 'AIzaSyANpTkJu00tCtQhpiGksHOGNfM-Qto3YMg';
const YOUTUBE_WATCH_URL = "https://www.youtube.com/watch?v=";

/**
 * Convert ISO 8601 duration (e.g. PT1H2M3S) to human-readable string (e.g. 1:02:03)
 * @param {string} isoDuration
 * @returns {string}
 */
function parseYouTubeDuration(isoDuration) {
  // Example: PT1H2M3S
  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return '';
  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);

  let result = '';
  if (hours > 0) {
    result += hours + ':';
    result += minutes.toString().padStart(2, '0') + ':';
    result += seconds.toString().padStart(2, '0');
  } else {
    result += minutes + ':';
    result += seconds.toString().padStart(2, '0');
  }
  return result;
}

/**
 * Get YouTube video info by video ID.
 * @param {string} videoId - The YouTube video ID.
 * @returns {Promise<Object>} - Video info object with title, url, channel, description, thumbnail, and duration.
 */
async function getYouTubeVideoInfo(videoId) {
  const params = new URLSearchParams({
    key: API_KEY,
    id: videoId,
    part: 'snippet,contentDetails',
  });

  const url = `${VIDEO_INFO_URL}?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`YouTube API error: ${res.statusText}`);
  }
  const data = await res.json();
  if (!data.items || data.items.length === 0) {
    throw new Error('No video found for the given ID');
  }
  const item = data.items[0];
  // console.log(item);
  return {
    title: item.snippet.title,
    url: YOUTUBE_WATCH_URL + videoId,
    channel: item.snippet.channelTitle,
    description: item.snippet.description,
    thumbnail: item.snippet.thumbnails?.default?.url,
    duration: parseYouTubeDuration(item.contentDetails.duration),
    duration_seconds: item.contentDetails.duration,
  };
}

/**
 * Convert ISO 8601 duration to seconds
 * @param {string} isoDuration - Duration in ISO 8601 format (e.g. PT1H2M3S)
 * @returns {number} - Duration in seconds
 */
function getVideoDurationInSeconds(isoDuration) {
  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  
  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);
  
  return hours * 3600 + minutes * 60 + seconds;
}

// Example usage:
if (require.main === module) {
  const videoId = process.argv[2] || '5qap5aO4i9A'; // Default: lofi hip hop radio
  getYouTubeVideoInfo(videoId)
    .then(info => {
      console.log('YouTube Video Info:');
      console.log(`Title: ${info.title}`);
      console.log(`URL: ${info.url}`);
      console.log(`Channel: ${info.channel}`);
      console.log(`Description: ${info.description}`);
      console.log(`Thumbnail: ${info.thumbnail}`);
      console.log(`Duration: ${info.duration}`);
    })
    .catch(err => {
      console.error('Error getting YouTube video info:', err.message);
    });
}

module.exports = {
  getYouTubeVideoInfo,
  getVideoDurationInSeconds
};
