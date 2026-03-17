import { useEffect, useState } from 'react';
import axios from 'axios';

export default function SecureImage({ src, alt, className = '', fallback = null }) {
    const [objectUrl, setObjectUrl] = useState(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let cancelled = false;
        let localObjectUrl = null;

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
        return fallback;
    }

    return <img src={objectUrl} alt={alt} className={className} />;
}
