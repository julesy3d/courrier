import { SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase';

/**
 * Upload a recorded video to Supabase Storage (card_videos bucket).
 * Returns the public URL of the uploaded video.
 */
export async function uploadCardVideo(
    localUri: string,
    userId: string,
    sessionToken: string
): Promise<string> {
    const fileName = `${userId}/${Date.now()}.mp4`;

    const formData = new FormData();
    formData.append('file', {
        uri: localUri,
        name: fileName,
        type: 'video/mp4',
    } as any);

    const response = await fetch(
        `${SUPABASE_URL}/storage/v1/object/card_videos/${fileName}`,
        {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${sessionToken}`,
                apikey: SUPABASE_ANON_KEY,
            },
            body: formData,
        }
    );

    if (!response.ok) {
        const errText = await response.text();
        console.error('Video upload error:', errText);
        throw new Error(`Failed to upload video: ${response.status} ${errText}`);
    }

    return `${SUPABASE_URL}/storage/v1/object/public/card_videos/${fileName}`;
}
