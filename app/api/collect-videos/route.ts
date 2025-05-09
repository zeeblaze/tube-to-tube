import { google } from 'googleapis';
import { NextResponse } from 'next/server';

export interface YouTubeVideoItem {
    id?: { videoId?: string };
    snippet?: {
      title?: string;
      thumbnails?: {
        medium?: { url?: string; width?: number; height?: number };
      };
    };
  }

export async function GET() {
  const apiKey = process.env.YOUTUBE_API_KEY;

  if (!apiKey) {
    console.warn('YouTube API Key not found in /api/collect-videos.');
    return NextResponse.json(
      { message: 'YouTube API Key is not configured on the server.' },
      { status: 500 }
    );
  }

  try {
    const youtube = google.youtube({ version: 'v3', auth: apiKey });
    const params = {
      part: ['snippet'],
      q: 'talk about money', // You can make this dynamic, e.g., via query parameters
      type: ['video'],
      maxResults: 10,
    };

    const response = await youtube.search.list(params);
    const videos = (response.data.items as YouTubeVideoItem[]) || [];

    return NextResponse.json(videos);
  } catch (error: any) {
    console.error('Error fetching YouTube videos in API route:', error);
    let errorMessage = 'Failed to fetch videos from YouTube.';
    // Try to get a more specific error message from the Google API client error
    if (error.response && error.response.data && error.response.data.error) {
        errorMessage = error.response.data.error.message || errorMessage;
    } else if (error.message) {
        errorMessage = error.message;
    }
    return NextResponse.json(
      { message: 'Error fetching videos from YouTube API.', error: errorMessage },
      { status: 500 }
    );
  }
}