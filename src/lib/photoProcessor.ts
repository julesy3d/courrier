import { ImageFormat, Skia } from '@shopify/react-native-skia';
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

const TARGET_WIDTH = 1200;
const TARGET_HEIGHT = Math.round(TARGET_WIDTH * (422 / 297)); // ≈ 1704

export async function processPhoto(inputUri: string): Promise<string> {
    const disposables: { dispose(): void }[] = [];

    try {
        // ---- DIRECTIVE 1: Bypass the JavaScript Heap for Image Loading ----
        let skData;
        if (typeof Skia.Data.fromURI !== 'function') {
            // FALLBACK: This version of react-native-skia does not expose fromURI.
            // Use the legacy Base64 path. This is a known memory hazard — leave the
            // TODO comment so it is addressed when the dependency is upgraded.
            // TODO: Upgrade @shopify/react-native-skia to a version supporting Skia.Data.fromURI
            const b64 = await FileSystem.readAsStringAsync(inputUri, {
                encoding: FileSystem.EncodingType.Base64,
            });
            skData = Skia.Data.fromBase64(b64);
        } else {
            skData = await Skia.Data.fromURI(inputUri);
        }

        if (skData && typeof (skData as any).dispose === 'function') {
            disposables.push(skData as any);
        }

        const skImage = Skia.Image.MakeImageFromEncoded(skData);
        if (!skImage) {
            console.error('Failed to decode image for Skia processing');
            return inputUri;
        }
        if (typeof skImage.dispose === 'function') {
            disposables.push(skImage);
        }

        // ---- DIRECTIVE 3: Single GPU Pass with Affine Crop Matrix ----
        const imgWidth = skImage.width();
        const imgHeight = skImage.height();

        // 1. Compute source crop rect (aspect-fill to 297:422 ratio)
        const targetRatio = 297 / 422;
        const currentRatio = imgWidth / imgHeight;
        let srcX = 0, srcY = 0, srcW = imgWidth, srcH = imgHeight;

        if (currentRatio > targetRatio) {
            // Source is wider than target — crop sides, keep full height
            srcW = imgHeight * targetRatio;
            srcX = (imgWidth - srcW) / 2;
        } else {
            // Source is taller than target — crop top/bottom, keep full width
            srcH = imgWidth / targetRatio;
            srcY = (imgHeight - srcH) / 2;
        }

        // 2. Build the matrix that maps destination coords -> source crop coords
        const cropMatrix = Skia.Matrix();
        if (typeof cropMatrix.translate === 'function' && typeof cropMatrix.scale === 'function') {
            cropMatrix.scale(TARGET_WIDTH / srcW, TARGET_HEIGHT / srcH);
            cropMatrix.translate(-srcX, -srcY);
        } else {
            // Need to manually set translation and scale.
            // Because Matrix exposes setting values, but the array layout is [scaleX, skewX, transX, skewY, scaleY, transY, pers0, pers1, pers2]
            const sX = TARGET_WIDTH / srcW;
            const sY = TARGET_HEIGHT / srcH;
            (cropMatrix as any).set([sX, 0, -srcX * sX, 0, sY, -srcY * sY, 0, 0, 1]);
        }
        if (typeof (cropMatrix as any).dispose === 'function') {
            disposables.push(cropMatrix as any);
        }

        // Create the runtime effect from the shader source
        const effect = Skia.RuntimeEffect.Make(POSTAL_SHADER_SOURCE);
        if (!effect) {
            console.error('Failed to compile Skia shader');
            return inputUri;
        }
        if (typeof effect.dispose === 'function') {
            disposables.push(effect);
        }

        // Create a surface to render onto
        const surface = Skia.Surface.MakeOffscreen(TARGET_WIDTH, TARGET_HEIGHT) || Skia.Surface.Make(TARGET_WIDTH, TARGET_HEIGHT);
        if (!surface) {
            console.error('Failed to create Skia offscreen surface');
            return inputUri;
        }
        if (typeof surface.dispose === 'function') {
            disposables.push(surface);
        }

        const canvas = surface.getCanvas();

        // Create the shader with uniforms
        const imageShader = skImage.makeShaderOptions(
            0, // TileMode.Clamp
            0, // TileMode.Clamp
            1, // FilterMode.Linear
            0, // MipmapMode.None
            cropMatrix
        );
        if (imageShader && typeof imageShader.dispose === 'function') {
            disposables.push(imageShader);
        }

        const shader = effect.makeShaderWithChildren(
            [TARGET_WIDTH, TARGET_HEIGHT, GRAIN_AMOUNT, VIGNETTE_STRENGTH, WARMTH],
            [imageShader]
        );
        if (shader && typeof shader.dispose === 'function') {
            disposables.push(shader);
        }

        // Draw with the shader
        const paint = Skia.Paint();
        paint.setShader(shader);
        if (typeof paint.dispose === 'function') {
            disposables.push(paint);
        }
        canvas.drawRect(Skia.XYWHRect(0, 0, TARGET_WIDTH, TARGET_HEIGHT), paint);

        surface.flush();

        // Extract the processed image
        const processedImage = surface.makeImageSnapshot();
        if (processedImage && typeof processedImage.dispose === 'function') {
            disposables.push(processedImage);
        }

        // ---- DIRECTIVE 5: Output Encoding Exception ----
        let processedData;
        let ext = 'webp';

        if (ImageFormat && typeof ImageFormat.WEBP !== 'undefined') {
            processedData = processedImage.encodeToBase64(ImageFormat.WEBP, 50);
        } else {
            processedData = processedImage.encodeToBase64();
            ext = 'png';
        }

        // Write to a temp file
        const outputPath = FileSystem.cacheDirectory + 'postal_processed_' + Date.now() + '.' + ext;
        await FileSystem.writeAsStringAsync(outputPath, processedData, {
            encoding: FileSystem.EncodingType.Base64,
        });

        return outputPath;

    } catch (e) {
        console.error('Error during Skia processing:', e);
        return inputUri;
    } finally {
        // ---- DIRECTIVE 2: Deterministic Destruction of Skia Host Objects ----
        for (const obj of disposables) {
            try {
                if (typeof obj.dispose === 'function') {
                    obj.dispose();
                }
            } catch (e) {
                // Ignore errors during disposal
            }
        }
    }
}
