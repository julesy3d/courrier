import { decode } from 'base64-arraybuffer';
import * as Device from 'expo-device';
import * as FileSystem from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Alert, Platform } from 'react-native';

// Target dimensions: match postcard aspect ratio (297:422), small for aggressive compression
const TARGET_WIDTH = 400;
const TARGET_HEIGHT = Math.round(TARGET_WIDTH * (422 / 297)); // ≈ 568

export type ImagePickSource = 'camera' | 'library';

/**
 * Launch the image picker (camera or library),
 * then crop to postcard ratio and aggressively compress to a small WebP file.
 * Returns the local URI of the compressed image, or null if cancelled.
 */
export async function pickAndCompressImage(source: ImagePickSource): Promise<string | null> {
    // Camera requires a physical device
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

    // Launch picker
    // Note: aspect ratio only works on Android. On iOS, allowsEditing gives a square crop.
    // We enforce the correct ratio via ImageManipulator afterward.
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
    const pickedUri = asset.uri;
    const pickedWidth = asset.width;
    const pickedHeight = asset.height;

    // Crop to postcard ratio (297:422) if the image isn't already that ratio.
    // This handles iOS's square crop — we center-crop to portrait.
    const targetRatio = 297 / 422; // ≈ 0.703 (portrait)
    const currentRatio = pickedWidth / pickedHeight;

    const context = ImageManipulator.manipulate(pickedUri);

    if (Math.abs(currentRatio - targetRatio) > 0.02) {
        // Need to crop
        let cropWidth: number;
        let cropHeight: number;
        let cropX: number;
        let cropY: number;

        if (currentRatio > targetRatio) {
            // Image is wider than target — crop sides
            cropHeight = pickedHeight;
            cropWidth = Math.round(pickedHeight * targetRatio);
            cropX = Math.round((pickedWidth - cropWidth) / 2);
            cropY = 0;
        } else {
            // Image is taller than target — crop top/bottom
            cropWidth = pickedWidth;
            cropHeight = Math.round(pickedWidth / targetRatio);
            cropX = 0;
            cropY = Math.round((pickedHeight - cropHeight) / 2);
        }

        context.crop({
            originX: cropX,
            originY: cropY,
            width: cropWidth,
            height: cropHeight,
        });
    }

    // Resize to target dimensions
    context.resize({ width: TARGET_WIDTH, height: TARGET_HEIGHT });

    // Render and save as compressed WebP
    const rendered = await context.renderAsync();
    const saved = await rendered.saveAsync({
        format: SaveFormat.WEBP,
        compress: 0.25,
    });

    return saved.uri;
}

/**
 * Upload a compressed image to Supabase Storage.
 * Returns the public URL of the uploaded image.
 */
export async function uploadPostcardImage(
    localUri: string,
    userId: string,
    supabase: any
): Promise<string> {
    const fileName = `${userId}/${Date.now()}.webp`;

    // Read local file as base64
    const base64 = await FileSystem.readAsStringAsync(localUri, {
        encoding: 'base64',
    });

    // Decode base64 to ArrayBuffer for upload
    const arrayBuffer = decode(base64);

    const { error: uploadError } = await supabase.storage
        .from('postcard-images')
        .upload(fileName, arrayBuffer, {
            contentType: 'image/webp',
            upsert: false,
        });

    if (uploadError) {
        console.error('Image upload error:', uploadError);
        throw uploadError;
    }

    const { data } = supabase.storage
        .from('postcard-images')
        .getPublicUrl(fileName);

    return data.publicUrl;
}
