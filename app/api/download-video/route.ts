import { NextRequest, NextResponse } from 'next/server';
import ytdl from '@distube/ytdl-core';
import ffmpegStatic from 'ffmpeg-static';
import ffmpeg from 'fluent-ffmpeg';
import { PassThrough } from 'stream';

// Tell fluent-ffmpeg where to find the ffmpeg binary
// This is especially useful for local development.
if (ffmpegStatic) {
  console.log('Attempting to use ffmpeg from ffmpeg-static. Path:', ffmpegStatic);
  ffmpeg.setFfmpegPath(ffmpegStatic);
} else {
  console.warn("ffmpeg-static not found. Ensure ffmpeg is installed and in your system's PATH for this to work, especially in production.");
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const videoId = searchParams.get('videoId');

  if (!videoId) {
    return NextResponse.json({ error: 'videoId query parameter is required', videoId: null }, { status: 400 });
  }

  if (!ytdl.validateID(videoId)) {
    return NextResponse.json({ error: 'Invalid YouTube video ID', videoId }, { status: 400 });
  }

  try {
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

    const info = await ytdl.getInfo(videoUrl);
    const videoTitle = info.videoDetails.title || 'youtube_video';
    const sanitizedFilenameBase = videoTitle
      .replace(/[^\w\s\-\.]/g, '_')
      .replace(/\s+/g, '_')
      .substring(0, 100);
    const filename = `${sanitizedFilenameBase}_trimmed_30s.mp4`;

    const headers = new Headers();
    headers.set('Content-Type', 'video/mp4');
    headers.set('Content-Disposition', `attachment; filename="${filename}"`);

    const videoStreamNode = ytdl(videoUrl, {
      quality: 'highestvideo',
      filter: format => format.container === 'mp4' && !!format.hasAudio && !!format.hasVideo,
    });

    videoStreamNode.once('readable', () => {
      console.log(`ytdl stream for videoId ${videoId} is readable.`);
    });
    videoStreamNode.once('data', (chunk) => {
      console.log(`ytdl stream for videoId ${videoId} produced its first chunk of data, size: ${chunk.length}`);
    });
    videoStreamNode.on('error', (err: Error) => {
      console.error(`ytdl stream error for videoId ${videoId} (this might be before or during ffmpeg processing):`, err.message, err.stack);
    });

    const ffmpegOutputPassThrough = new PassThrough();

    const ffmpegCommand = ffmpeg(videoStreamNode)
      .setStartTime('00:00:00')
      .setDuration(30)
      .toFormat('mp4')
      .outputOptions([
        '-movflags frag_keyframe+empty_moov', // Essential for streaming MP4s
        '-preset ultrafast', // For faster processing. Adjust if higher quality is needed.
        '-tune zerolatency',   // May help with faster start for streaming.
        // '-c:v libx264', // Explicitly set video codec if needed
        // '-c:a aac',     // Explicitly set audio codec if needed
      ])
      .on('start', (commandLine: string) => {
        console.log(`FFmpeg process started for videoId ${videoId}: ${commandLine}`);
      })
      .on('codecData', (data: any) => {
        console.log(`FFmpeg codecData for videoId ${videoId}: Input is ${data.audio} audio with ${data.video} video`);
      })
      .on('progress', (progress: any) => {
        if (progress.timemark) {
          console.log(`FFmpeg processing for videoId ${videoId}: Timemark ${progress.timemark}`);
        } else if (progress.percent) {
          console.log(`FFmpeg processing for videoId ${videoId}: ${progress.percent.toFixed(2)}% done`);
        }
      })
      // @ts-ignore - Temporary workaround if type definitions are causing issues
      .on('error', (err: Error, stdout: string, stderr: string) => {
        console.error(`FFmpeg error during processing for videoId ${videoId}:`, err.message);
        if (stdout) console.error('FFmpeg stdout:', stdout);
        if (stderr) console.error('FFmpeg stderr:', stderr);
        if (!ffmpegOutputPassThrough.destroyed) {
          ffmpegOutputPassThrough.emit('error', new Error(`FFmpeg processing failed: ${err.message}. FFmpeg stderr: ${stderr}`));
        }
      })
      .on('end', () => {
        console.log(`FFmpeg process finished successfully for videoId ${videoId}. Closing output stream.`);
      });

    ffmpegCommand.pipe(ffmpegOutputPassThrough, { end: true });

    const readableWebStream = new ReadableStream({
      start(controller) {
        ffmpegOutputPassThrough.on('data', (chunk: Buffer) => {
          controller.enqueue(chunk);
        });
        ffmpegOutputPassThrough.on('end', () => {
          console.log(`FFmpeg stream ended for videoId ${videoId}. Closing web stream controller.`);
          controller.close();
        });
        ffmpegOutputPassThrough.on('error', (err: Error) => {
          console.error(`Error in ffmpegOutputPassThrough for videoId ${videoId}:`, err);
          controller.error(err);
        });

        videoStreamNode.on('error', (err: Error) => {
          if (!ffmpegOutputPassThrough.destroyed) {
            ffmpegOutputPassThrough.emit('error', new Error(`ytdl stream error: ${err.message}`));
          }
        });
      },
      cancel() {
        console.log(`ReadableStream cancelled for videoId ${videoId}. Destroying streams and FFmpeg process.`);
        if (videoStreamNode && typeof videoStreamNode.destroy === 'function') {
          videoStreamNode.destroy();
        }
        if (ffmpegOutputPassThrough && typeof ffmpegOutputPassThrough.destroy === 'function') {
          ffmpegOutputPassThrough.destroy();
        }
        if (ffmpegCommand && typeof (ffmpegCommand as any).kill === 'function') {
          (ffmpegCommand as any).kill('SIGKILL'); // Force kill ffmpeg process
          console.log(`FFmpeg process killed for videoId ${videoId}.`);
        }
      },
    });

    return new NextResponse(readableWebStream, { headers });

  } catch (error: any) {
    console.error(`Error downloading video for videoId ${videoId}:`, error);
    // This catch block primarily handles errors from ytdl.getInfo() or initial setup.
    let errorMessage = 'Failed to download video.';
    let statusCode = 500;

    if (error && typeof error.message === 'string') {
      const ytdlErrorMessage = error.message.toLowerCase();

      if (ytdlErrorMessage.includes('unavailable') || ytdlErrorMessage.includes('private') || ytdlErrorMessage.includes('video not found')) {
        statusCode = 404;
        errorMessage = 'Video is unavailable, private, or not found.';
      } else if (ytdlErrorMessage.includes('extract function') || ytdlErrorMessage.includes('cipher') || ytdlErrorMessage.includes('signature')) {
        statusCode = 503;
        errorMessage = `Error processing YouTube video: ${error.message}. This often indicates an issue with YouTube's current video delivery mechanism or that the 'ytdl-core' library needs an update to adapt to recent YouTube changes. Please check the ytdl-core GitHub repository for known issues.`;
        console.error(`Detailed ytdl-core error for videoId ${videoId}: ${error.message}`, error.stack);
      } else if (ytdlErrorMessage.includes('no formats found matching quality') || ytdlErrorMessage.includes('no such format found')) {
        statusCode = 422; // Unprocessable Entity - format not suitable
        errorMessage = `Could not find a suitable MP4 format with both video and audio for videoId ${videoId}. The video might only offer separate streams. Error: ${error.message}`;
      } else if (ytdlErrorMessage.includes('sign in to confirm') || ytdlErrorMessage.includes('confirm you’re not a bot')) {
        statusCode = 403; // Forbidden
        errorMessage = `YouTube requires verification to access this video. This may be due to bot detection. Please try again later or from a different network. Original error: ${error.message}`;
      }
      else {
        errorMessage = error.message;
      }
    } else if (error && error.message) {
        errorMessage = `An unexpected error occurred: ${JSON.stringify(error.message)}`;
    } else {
        errorMessage = 'An unknown error occurred while trying to download the video.';
    }
    return NextResponse.json({ error: errorMessage, videoId: videoId }, { status: statusCode });
  }
}
