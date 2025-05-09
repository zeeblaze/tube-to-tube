import Image from "next/image";

export interface YouTubeVideoItem {
  id?: { videoId?: string };
  snippet?: {
    title?: string;
    thumbnails?: {
      medium?: { url?: string; width?: number; height?: number };
    };
  };
}

export default async function Home() {
  let videos: YouTubeVideoItem[] = [];
  let fetchError: string | null = null;

  try {
    // Ensure NEXT_PUBLIC_APP_URL is set in your .env.local or .env file
    // e.g., NEXT_PUBLIC_APP_URL=http://localhost:3000
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const response = await fetch(`${appUrl}/api/collect-videos`, {
      cache: "no-store", // Fetches fresh data on every request. Adjust caching as needed.
    });

    if (!response.ok) {
      let errorMessage = `API request failed with status ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.message || errorData.error || errorMessage;
      } catch (e) {
        // Response was not JSON or error in parsing, stick with the status code message
      }
      throw new Error(errorMessage);
    }
    videos = await response.json(); // Assuming the API returns YouTubeVideoItem[] directly
    console.log('Fetched Videos from API:', videos.length);
  } catch (error) {
    console.error('Error fetching videos from /api/collect-videos:', error);
    fetchError = error instanceof Error ? error.message : 'An unknown error occurred while fetching videos.';
    videos = []; // Ensure videos is empty on error
  }

  return (
    <div className="flex flex-col min-h-screen">
      <main className="flex-grow container mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-4xl sm:text-5xl font-bold text-center mb-12 tracking-tight">
          TUBE-TOK
        </h1>
      {/* Section to display fetched videos */}
      {!fetchError && videos.length > 0 && (
          <section className="w-full">
            <h2 className="text-2xl font-semibold mb-6 text-center sm:text-left">
              Fetched Videos
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {videos.map((video) => {
                const videoId = video.id?.videoId;
                const videoUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : '#';
                const thumbnailUrl = video.snippet?.thumbnails?.medium?.url;
                const thumbnailWidth = video.snippet?.thumbnails?.medium?.width || 320;
                const thumbnailHeight = video.snippet?.thumbnails?.medium?.height || 180;

                if (!videoId || !video.snippet?.title || !thumbnailUrl) {
                  return null; // Skip rendering if essential data is missing
                }

                return (
                  <a key={videoId} href={videoUrl} target="_blank" rel="noopener noreferrer" className="block group bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 ease-in-out transform hover:-translate-y-1">
                    {thumbnailUrl && (
                      <Image
                        src={thumbnailUrl}
                        alt={video.snippet.title || 'Video thumbnail'}
                        width={thumbnailWidth}
                        height={thumbnailHeight}
                        className="w-full h-auto object-cover aspect-video" // aspect-video ensures consistent thumbnail ratio
                      />
                    )}
                    <div className="p-4">
                      <h3 className="text-md font-semibold text-gray-800 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 truncate" title={video.snippet.title}>{video.snippet.title}</h3>
                    </div>
                  </a>
                );
              })}
            </div>
          </section>
        )}
        {!fetchError && videos.length === 0 && (
          <p className="mt-12 text-center text-gray-600 dark:text-gray-400">
            No videos found.
          </p>
        )}
        {fetchError && (
          <p className="mt-12 text-center text-red-600 dark:text-red-400">Error: {fetchError}</p>
        )}
      </main>
      <footer className="w-full py-8 mt-16 border-t border-gray-200 dark:border-gray-700">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 flex flex-wrap items-center justify-center gap-x-8 gap-y-4 text-sm text-gray-600 dark:text-gray-400">
        <a
          className="flex items-center gap-2 hover:underline hover:underline-offset-4"
          href="https://nextjs.org/learn?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Image
            aria-hidden
            src="/file.svg"
            alt="File icon"
            width={16}
            height={16}
          />
          Learn Next.js
        </a>
        <a
          className="flex items-center gap-2 hover:underline hover:underline-offset-4"
          href="https://vercel.com/templates?framework=next.js&utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Image
            aria-hidden
            src="/window.svg"
            alt="Window icon"
            width={16}
            height={16}
          />
          Next.js Templates
        </a>
        <a
          className="flex items-center gap-2 hover:underline hover:underline-offset-4"
          href="https://nextjs.org?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Image
            aria-hidden
            src="/globe.svg"
            alt="Globe icon"
            width={16}
            height={16}
          />
          Go to nextjs.org →
        </a>
        </div>
      </footer>
    </div>
  );
}
