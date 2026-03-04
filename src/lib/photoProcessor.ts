import { Skia } from '@shopify/react-native-skia';
import * as FileSystem from 'expo-file-system/legacy';

// ---- SHADER SOURCE ----
// This SkSL shader does three things in one GPU pass:
// 1. Warm color grading (lifted blacks, warm highlights, slightly muted blues)
// 2. Vignette (soft radial darkening from edges)
// 3. Film grain (hash-based noise per pixel)

const POSTAL_SHADER_SOURCE = `
uniform shader image;
uniform float2 resolution;
uniform float grainAmount;      // 0.0 to 0.15 — how visible the grain is
uniform float vignetteStrength;  // 0.0 to 0.5 — how dark the edges get
uniform float warmth;            // 0.0 to 0.3 — how warm the color shift is

// Simple hash function for grain — no texture needed
float hash(float2 p) {
    float3 p3 = fract(float3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

half4 main(float2 coord) {
    half4 color = image.eval(coord);

    // ---- COLOR GRADE ----
    // Warm the image: boost reds slightly, keep greens, reduce blues
    color.r = color.r * (1.0 + warmth) + warmth * 0.03;
    color.g = color.g * (1.0 + warmth * 0.3);
    color.b = color.b * (1.0 - warmth * 0.4) + warmth * 0.02;

    // Lift the blacks — shadows become dark brown, not pure black
    float liftAmount = 0.04;
    color.rgb = color.rgb * (1.0 - liftAmount) + liftAmount;

    // Slight S-curve for contrast
    color.rgb = color.rgb * color.rgb * (3.0 - 2.0 * color.rgb);

    // Desaturate slightly — analog film is never fully saturated
    float luminance = dot(color.rgb, half3(0.299, 0.587, 0.114));
    color.rgb = mix(half3(luminance), color.rgb, 0.85);

    // ---- VIGNETTE ----
    float2 uv = coord / resolution;
    float2 center = uv - 0.5;
    float dist = length(center);
    float vignette = 1.0 - smoothstep(0.3, 0.85, dist) * vignetteStrength;
    color.rgb *= vignette;

    // ---- GRAIN ----
    float noise = hash(coord * 1.0) * 2.0 - 1.0;
    color.rgb += noise * grainAmount;

    // Clamp to valid range
    color.rgb = clamp(color.rgb, half3(0.0), half3(1.0));

    return color;
}
`;

// ---- TUNING CONSTANTS ----
// Adjust these to taste. These are the starting values.
const GRAIN_AMOUNT = 0.08;         // Subtle grain — visible on close look, not distracting
const VIGNETTE_STRENGTH = 0.35;    // Noticeable but not dramatic
const WARMTH = 0.15;               // Warm but not orange

export async function processPhoto(inputUri: string): Promise<string> {
    // Load the source image into Skia
    const imageData = await FileSystem.readAsStringAsync(inputUri, {
        encoding: FileSystem.EncodingType.Base64,
    });
    const skData = Skia.Data.fromBase64(imageData);
    const skImage = Skia.Image.MakeImageFromEncoded(skData);

    if (!skImage) {
        console.error('Failed to decode image for Skia processing');
        // Fall back: return original image unprocessed
        return inputUri;
    }

    const width = skImage.width();
    const height = skImage.height();

    // Create the runtime effect from the shader source
    const effect = Skia.RuntimeEffect.Make(POSTAL_SHADER_SOURCE);
    if (!effect) {
        console.error('Failed to compile Skia shader');
        return inputUri;
    }

    // Create a surface to render onto
    const surface = Skia.Surface.MakeOffscreen(width, height) || Skia.Surface.Make(width, height);
    if (!surface) {
        console.error('Failed to create Skia offscreen surface');
        return inputUri;
    }

    const canvas = surface.getCanvas();

    // Create the shader with uniforms
    const imageShader = skImage.makeShaderOptions(
        0, // TileMode.Clamp
        0, // TileMode.Clamp
        1, // FilterMode.Linear
        0, // MipmapMode.None
        Skia.Matrix()
    );

    const shader = effect.makeShaderWithChildren(
        [width, height, GRAIN_AMOUNT, VIGNETTE_STRENGTH, WARMTH],
        [imageShader]
    );

    // Draw with the shader
    const paint = Skia.Paint();
    paint.setShader(shader);
    canvas.drawRect(Skia.XYWHRect(0, 0, width, height), paint);

    surface.flush();

    // Extract the processed image
    const processedImage = surface.makeImageSnapshot();
    const processedData = processedImage.encodeToBase64();

    // Write to a temp file
    const outputPath = FileSystem.cacheDirectory + 'postal_processed_' + Date.now() + '.jpg';
    await FileSystem.writeAsStringAsync(outputPath, processedData, {
        encoding: FileSystem.EncodingType.Base64,
    });

    return outputPath;
}
