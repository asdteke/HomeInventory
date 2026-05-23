import * as React from 'react';
import { useEffect, useState } from 'react';
import axios from 'axios';

export interface SecureImageProps {
    src?: string | null;
    alt: string;
    className?: string;
    fallback?: React.ReactNode;
}

export default function SecureImage({ src, alt, className = '', fallback = null }: SecureImageProps) {
    const [objectUrl, setObjectUrl] = useState<string | null>(null);
    const [failed, setFailed] = useState<boolean>(false);

    useEffect(() => {
        let cancelled = false;
        let localObjectUrl: string | null = null;

        async function loadImage() {
            if (!src) {
                setObjectUrl(null);
                setFailed(false);
                return;
            }

            try {
                setFailed(false);
                const response = await axios.get(src, { responseType: 'blob' });
                if (cancelled) {
                    return;
                }

                localObjectUrl = URL.createObjectURL(response.data);
                setObjectUrl(localObjectUrl);
            } catch (error) {
                if (!cancelled) {
                    setFailed(true);
                    setObjectUrl(null);
                }
            }
        }

        loadImage();

        return () => {
            cancelled = true;
            if (localObjectUrl) {
                URL.revokeObjectURL(localObjectUrl);
            }
        };
    }, [src]);

    if (!src || failed || !objectUrl) {
        return <>{fallback}</>;
    }

    return <img src={objectUrl} alt={alt} className={className} />;
}
