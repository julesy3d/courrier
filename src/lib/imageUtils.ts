import * as Device from 'expo-device';
import * as ImagePicker from 'expo-image-picker';
import { Alert, Platform } from 'react-native';
import { processPhoto } from './photoProcessor';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase';

export type ImagePickSource = 'camera' | 'library';

/**
 * Launch the image picker (camera or library),
 * then crop to postcard ratio and aggressively compress to a small WebP file.
 * Returns the local URI of the compressed image, or null if cancelled.
 */
export async function pickAndCompressImage(source: ImagePickSource): Promise<string | null> {
    if (source === 'camera') {
        if (!Device.isDevice) {
            Alert.alert('Camera is not available on the simulator.');
            return null;
        }
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Camera access is needed to take photos.');
            return null;
        }
    }

    const pickerOptions: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.8,
        ...(Platform.OS === 'android' ? { aspect: [297, 422] as [number, number] } : {}),
    };

    const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync(pickerOptions)
        : await ImagePicker.launchImageLibraryAsync(pickerOptions);

    if (result.canceled || !result.assets || result.assets.length === 0) {
        return null;
    }

    const asset = result.assets[0];

    // Process image through Skia for crop, sizing, effects, and WebP compression
    return await processPhoto(asset.uri);
}

/**
 * Upload a compressed image to Supabase Storage.
 * Returns the public URL of the uploaded image.
 */
export async function uploadPostcardImage(
    localUri: string,
    userId: string,
    sessionToken: string
): Promise<string> {
    const fileName = `${userId}/${Date.now()}.webp`;

    const formData = new FormData();
    formData.append('file', {
        uri: localUri,
        name: fileName,
        type: 'image/webp',
    } as any);

    const response = await fetch(
        `${SUPABASE_URL}/storage/v1/object/postcard-images/${fileName}`,
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

    return `${SUPABASE_URL}/storage/v1/object/public/postcard-images/${fileName}`;
}
