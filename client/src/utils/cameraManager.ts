// Global Camera Stream Manager - Singleton pattern for camera hardware lock prevention
// This utility ensures only one camera stream exists at a time across all scanners

declare global {
    interface Window {
        localStream?: MediaStream | null;
    }
}

class CameraStreamManager {
    private activeStream: MediaStream | null = null;
    private activeScannerId: string | null = null;
    private isReleasing = false;

    // Force release all camera streams globally
    async releaseAllStreams(): Promise<void> {
        if (this.isReleasing) {
            // Wait for ongoing release to complete
            await new Promise(resolve => setTimeout(resolve, 200));
            return;
        }

        this.isReleasing = true;

        try {
            // Release stored stream
            if (this.activeStream) {
                this.activeStream.getTracks().forEach(track => {
                    try {
                        track.stop();
                    } catch (e) {
                        console.log('Track stop error:', e);
                    }
                });
                this.activeStream = null;
            }

            // Also check window.localStream for any orphaned streams
            if (window.localStream) {
                window.localStream.getTracks().forEach(track => {
                    try {
                        track.stop();
                    } catch (e) {
                        console.log('Window stream track stop error:', e);
                    }
                });
                window.localStream = null;
            }

            // Force stop any video elements that might have orphaned streams
            const videoElements = document.querySelectorAll('video');
            videoElements.forEach(video => {
                const srcObj = video.srcObject as MediaStream | null;
                if (srcObj) {
                    srcObj.getTracks().forEach(track => {
                        try {
                            track.stop();
                        } catch (e) { }
                    });
                    video.srcObject = null;
                }
            });

            this.activeScannerId = null;
        } catch (err) {
            console.log('Release streams error:', err);
        } finally {
            this.isReleasing = false;
        }
    }

    // Register a new stream
    registerStream(stream: MediaStream, scannerId: string): void {
        this.activeStream = stream;
        this.activeScannerId = scannerId;
        window.localStream = stream; // Also set on window for global access
    }

    // Check if camera is available
    isAvailable(): boolean {
        return !this.activeStream && !this.isReleasing;
    }

    // Get active scanner ID
    getActiveScannerId(): string | null {
        return this.activeScannerId;
    }
}

// Singleton instance
const cameraManager = new CameraStreamManager();

export default cameraManager;
