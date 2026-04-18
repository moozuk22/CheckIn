"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";

interface Video {
  id: string;
  displayName: string;
  sizeBytes: number;
  durationSecs: number | null;
}

interface ShareData {
  name: string | null;
  videos: Video[];
}

export default function WatchPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<ShareData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/public/share/${token}`);
      if (res.status === 404) {
        setError("Невалиден линк");
        return;
      }
      if (!res.ok) {
        setError("Грешка при зареждане");
        return;
      }
      const json = await res.json();
      setData(json);
      if (json.videos.length > 0 && !activeVideoId) {
        setActiveVideoId(json.videos[0].id);
      }
    } catch {
      setError("Грешка при свързване със сървъра");
    } finally {
      setLoading(false);
    }
  }, [token, activeVideoId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="watch-page">
        <div className="watch-loading">
          <div className="loading" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="watch-page">
        <div className="watch-error">
          <h1>{error}</h1>
        </div>
      </div>
    );
  }

  if (!data || data.videos.length === 0) {
    return (
      <div className="watch-page">
        <div className="watch-error">
          <h1>Няма налични видеа</h1>
        </div>
      </div>
    );
  }

  const activeVideo = data.videos.find((v) => v.id === activeVideoId) || data.videos[0];

  return (
    <div className="watch-page">
      <div className="watch-header">
        <h1 className="text-gold">{data.name || "Споделени видеа"}</h1>
      </div>

      <div className="watch-player">
        <video
          key={activeVideo.id}
          controls
          autoPlay={false}
          style={{ width: "100%", maxHeight: "70vh", backgroundColor: "#000" }}
        >
          <source
            src={`/api/public/stream/${token}/${activeVideo.id}`}
            type="video/mp4"
          />
          Вашият браузър не поддържа видео.
        </video>
        <h2 className="watch-video-title">{activeVideo.displayName}</h2>
        {activeVideo.durationSecs && (
          <span className="text-muted" style={{ fontSize: "0.85rem" }}>
            {formatDuration(activeVideo.durationSecs)}
          </span>
        )}
      </div>

      {data.videos.length > 1 && (
        <div className="watch-list">
          <h3 style={{ marginBottom: "0.75rem" }}>Всички видеа</h3>
          {data.videos.map((video) => (
            <button
              key={video.id}
              className={`watch-list-item ${video.id === activeVideo.id ? "active" : ""}`}
              onClick={() => setActiveVideoId(video.id)}
            >
              <span className="watch-list-item-name">{video.displayName}</span>
              <span className="text-muted" style={{ fontSize: "0.8rem" }}>
                {video.durationSecs
                  ? formatDuration(video.durationSecs)
                  : formatSize(video.sizeBytes)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function formatDuration(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
}
