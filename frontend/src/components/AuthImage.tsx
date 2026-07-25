import { useEffect, useState } from 'react';
import api from '../lib/api';

interface AuthImageProps {
  src: string;
  alt: string;
  className?: string;
}

function mediaRequestUrl(src: string): string {
  if (/^https?:\/\//.test(src)) return src;
  const apiBase = import.meta.env.VITE_API_URL || '';
  const mediaBase = apiBase.replace(/\/api\/?$/, '');
  return `${mediaBase}${src}`;
}

export default function AuthImage({ src, alt, className }: AuthImageProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    let revoked = false;
    let nextObjectUrl: string | null = null;

    api.get(mediaRequestUrl(src), { baseURL: '', responseType: 'blob' })
      .then(({ data }) => {
        if (revoked) return;
        nextObjectUrl = URL.createObjectURL(data);
        setObjectUrl(nextObjectUrl);
      })
      .catch(() => {
        if (!revoked) setObjectUrl(null);
      });

    return () => {
      revoked = true;
      if (nextObjectUrl) URL.revokeObjectURL(nextObjectUrl);
    };
  }, [src]);

  if (!objectUrl) return null;
  return <img src={objectUrl} alt={alt} className={className} />;
}
