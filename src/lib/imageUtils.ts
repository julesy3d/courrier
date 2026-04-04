import { SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase';

/**
 * Upload a captured photo to Supabase Storage (card_videos bucket).
 * Returns the public URL of the uploaded image.
 */
export async function uploadCardImage(
    localUri: string,
    userId: string,
    sessionToken: string
): Promise<string> {
    const fileName = `${userId}/${Date.now()}.jpg`;

    const formData = new FormData();
    formData.append('file', {
        uri: localUri,
        name: fileName,
        type: 'image/jpeg',
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
        console.error('Image upload error:', errText);
        throw new Error(`Failed to upload image: ${response.status} ${errText}`);
    }

    return `${SUPABASE_URL}/storage/v1/object/public/card_videos/${fileName}`;
}
