import React, { useMemo } from 'react';
import { Image, ImageBackground, Text, View } from 'react-native';
import {
    CARD_HEIGHT,
    CARD_WIDTH,
    IMAGE_INSET,
    STAMP_BOX_CENTER_X,
    STAMP_BOX_CENTER_Y,
    STAMP_HEIGHT,
    STAMP_WIDTH,
    TAMPON_HEIGHT,
    TAMPON_WIDTH,
    VERSO_CONTENT_LEFT,
    VERSO_CONTENT_RIGHT,
    VERSO_MESSAGE_BOTTOM,
    VERSO_MESSAGE_TOP,
    VERSO_RECIPIENT_ADDR_Y,
    VERSO_RECIPIENT_NAME_Y,
} from '../lib/postcardLayout';

interface PostcardCaptureProps {
    imageUri: string | null;       // The photo on the recto
    body: string;                  // Message text
    toName: string;                // Recipient display name
    toAddress: string;             // Recipient's address (or placeholder text)
    rectoRef: React.Ref<View>;   // Ref for capturing recto
    versoRef: React.Ref<View>;   // Ref for capturing verso
    compositeRef: React.Ref<View>; // Ref for capturing composite
    locale: 'en' | 'fr';
}

const rectoTexture = require('../assets/images/postcard_recto.webp');

function seededRandom(seed: string) {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        const char = seed.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0;
    }
    return () => {
        hash = (hash * 1103515245 + 12345) & 0x7fffffff;
        return (hash >>> 0) / 0x7fffffff;
    };
}

export default function PostcardCapture({
    imageUri,
    body,
    toName,
    toAddress,
    rectoRef,
    versoRef,
    compositeRef,
    locale
}: PostcardCaptureProps) {
    const versoTexture = locale === 'fr'
        ? require('../assets/images/postcard_verso_FR.webp')
        : require('../assets/images/postcard_verso_ENG.webp');

    const stampOffsets = useMemo(() => {
        const random = seededRandom(Date.now().toString());
        return {
            stampDx: (random() - 0.5) * 10,
            stampDy: (random() - 0.5) * 10,
            stampRot: (random() - 0.5) * 20,
            tamponDx: (random() - 0.5) * 30,
            tamponDy: (random() - 0.5) * 30,
            tamponRot: (random() - 0.5) * 40,
        };
    }, []);

    return (
        <View style={{ position: 'absolute', left: -9999, top: 0 }}>
            {/* RECTO CAPTURE */}
            <View ref={rectoRef} style={{ width: CARD_WIDTH, height: CARD_HEIGHT }} collapsable={false}>
                <ImageBackground
                    source={rectoTexture}
                    style={{ width: '100%', height: '100%', overflow: 'hidden' }}
                    resizeMode="cover"
                >
                    <View style={{ flex: 1, margin: IMAGE_INSET, borderRadius: 4, overflow: 'hidden' }}>
                        {imageUri ? (
                            <Image
                                source={{ uri: imageUri }}
                                style={{ width: '100%', height: '100%' }}
                                resizeMode="cover"
                            />
                        ) : null}
                    </View>
                </ImageBackground>
            </View>

            {/* VERSO CAPTURE */}
            <View ref={versoRef} style={{ width: CARD_WIDTH, height: CARD_HEIGHT }} collapsable={false}>
                <ImageBackground
                    source={versoTexture}
                    style={{ width: '100%', height: '100%', overflow: 'hidden' }}
                    resizeMode="cover"
                >
                    {/* Message body — full width zone */}
                    <View style={{
                        position: 'absolute',
                        top: CARD_HEIGHT * VERSO_MESSAGE_TOP,
                        bottom: CARD_HEIGHT * (1 - VERSO_MESSAGE_BOTTOM),
                        left: CARD_WIDTH * VERSO_CONTENT_LEFT,
                        right: CARD_WIDTH * (1 - VERSO_CONTENT_RIGHT),
                    }}>
                        <Text style={{
                            flex: 1,
                            fontFamily: 'Georgia',
                            fontSize: 14,
                            lineHeight: 20,
                            color: '#1a1a1a',
                        }}>
                            {body}
                        </Text>
                    </View>

                    {/* Recipient name — on first dotted line */}
                    <View style={{
                        position: 'absolute',
                        top: CARD_HEIGHT * VERSO_RECIPIENT_NAME_Y,
                        left: CARD_WIDTH * VERSO_CONTENT_LEFT,
                        right: CARD_WIDTH * (1 - VERSO_CONTENT_RIGHT),
                    }}>
                        {toName ? (
                            <Text style={{ fontFamily: 'Georgia', fontSize: 14, color: '#1a1a1a' }}>
                                {toName}
                            </Text>
                        ) : null}
                    </View>

                    {/* Recipient address — on second dotted line */}
                    <View style={{
                        position: 'absolute',
                        top: CARD_HEIGHT * VERSO_RECIPIENT_ADDR_Y,
                        left: CARD_WIDTH * VERSO_CONTENT_LEFT,
                        right: CARD_WIDTH * (1 - VERSO_CONTENT_RIGHT),
                    }}>
                        <Text style={{ fontFamily: 'Georgia', fontSize: 14, color: '#1a1a1a' }}>
                            {toAddress || (locale === 'fr' ? 'adresse à venir' : 'address pending')}
                        </Text>
                    </View>

                    {/* STAMP */}
                    <View style={{
                        position: 'absolute',
                        top: CARD_HEIGHT * STAMP_BOX_CENTER_Y - STAMP_HEIGHT / 2 + stampOffsets.stampDy,
                        left: CARD_WIDTH * STAMP_BOX_CENTER_X - STAMP_WIDTH / 2 + stampOffsets.stampDx,
                        width: STAMP_WIDTH,
                        height: STAMP_HEIGHT,
                        transform: [{ rotate: `${stampOffsets.stampRot}deg` }],
                    }}>
                        <Image
                            source={require('../assets/images/stamp.png')}
                            style={{ width: '100%', height: '100%' }}
                            resizeMode="contain"
                        />
                    </View>

                    {/* TAMPON (postmark) */}
                    <View style={{
                        position: 'absolute',
                        top: Math.max(0, Math.min(
                            CARD_HEIGHT * STAMP_BOX_CENTER_Y - TAMPON_HEIGHT / 2 + stampOffsets.tamponDy,
                            CARD_HEIGHT - TAMPON_HEIGHT
                        )),
                        left: Math.max(0, Math.min(
                            CARD_WIDTH * STAMP_BOX_CENTER_X - TAMPON_WIDTH * 0.72 + stampOffsets.tamponDx,
                            CARD_WIDTH - TAMPON_WIDTH
                        )),
                        width: TAMPON_WIDTH,
                        height: TAMPON_HEIGHT,
                        transform: [{ rotate: `${stampOffsets.tamponRot}deg` }],
                        opacity: 0.7,
                        overflow: 'hidden',
                    }}>
                        <Image
                            source={require('../assets/images/tampon.png')}
                            style={{ width: '100%', height: '100%' }}
                            resizeMode="contain"
                        />
                    </View>
                </ImageBackground>
            </View>

            {/* COMPOSITE -- recto and verso side by side for image sharing */}
            <View
                ref={compositeRef}
                collapsable={false}
                style={{
                    flexDirection: 'row',
                    backgroundColor: '#f5f0eb',
                    padding: 16,
                    gap: 12,
                }}
            >
                {/* Recto (left) */}
                <View style={{ width: CARD_WIDTH, height: CARD_HEIGHT }}>
                    <ImageBackground
                        source={rectoTexture}
                        style={{ width: '100%', height: '100%', overflow: 'hidden' }}
                        resizeMode="cover"
                    >
                        <View style={{ flex: 1, margin: IMAGE_INSET, borderRadius: 4, overflow: 'hidden' }}>
                            {imageUri ? (
                                <Image
                                    source={{ uri: imageUri }}
                                    style={{ width: '100%', height: '100%' }}
                                    resizeMode="cover"
                                />
                            ) : null}
                        </View>
                    </ImageBackground>
                </View>

                {/* Verso (right) */}
                <View style={{ width: CARD_WIDTH, height: CARD_HEIGHT }}>
                    <ImageBackground
                        source={versoTexture}
                        style={{ width: '100%', height: '100%', overflow: 'hidden' }}
                        resizeMode="cover"
                    >
                        {/* Message body — full width zone */}
                        <View style={{
                            position: 'absolute',
                            top: CARD_HEIGHT * VERSO_MESSAGE_TOP,
                            bottom: CARD_HEIGHT * (1 - VERSO_MESSAGE_BOTTOM),
                            left: CARD_WIDTH * VERSO_CONTENT_LEFT,
                            right: CARD_WIDTH * (1 - VERSO_CONTENT_RIGHT),
                        }}>
                            <Text style={{
                                flex: 1,
                                fontFamily: 'Georgia',
                                fontSize: 14,
                                lineHeight: 20,
                                color: '#1a1a1a',
                            }}>
                                {body}
                            </Text>
                        </View>

                        {/* Recipient name — on first dotted line */}
                        <View style={{
                            position: 'absolute',
                            top: CARD_HEIGHT * VERSO_RECIPIENT_NAME_Y,
                            left: CARD_WIDTH * VERSO_CONTENT_LEFT,
                            right: CARD_WIDTH * (1 - VERSO_CONTENT_RIGHT),
                        }}>
                            {toName ? (
                                <Text style={{ fontFamily: 'Georgia', fontSize: 14, color: '#1a1a1a' }}>
                                    {toName}
                                </Text>
                            ) : null}
                        </View>

                        {/* Recipient address — on second dotted line */}
                        <View style={{
                            position: 'absolute',
                            top: CARD_HEIGHT * VERSO_RECIPIENT_ADDR_Y,
                            left: CARD_WIDTH * VERSO_CONTENT_LEFT,
                            right: CARD_WIDTH * (1 - VERSO_CONTENT_RIGHT),
                        }}>
                            <Text style={{ fontFamily: 'Georgia', fontSize: 14, color: '#1a1a1a' }}>
                                {toAddress || (locale === 'fr' ? 'adresse à venir' : 'address pending')}
                            </Text>
                        </View>

                        {/* STAMP */}
                        <View style={{
                            position: 'absolute',
                            top: CARD_HEIGHT * STAMP_BOX_CENTER_Y - STAMP_HEIGHT / 2 + stampOffsets.stampDy,
                            left: CARD_WIDTH * STAMP_BOX_CENTER_X - STAMP_WIDTH / 2 + stampOffsets.stampDx,
                            width: STAMP_WIDTH,
                            height: STAMP_HEIGHT,
                            transform: [{ rotate: `${stampOffsets.stampRot}deg` }],
                        }}>
                            <Image
                                source={require('../assets/images/stamp.png')}
                                style={{ width: '100%', height: '100%' }}
                                resizeMode="contain"
                            />
                        </View>

                        {/* TAMPON (postmark) */}
                        <View style={{
                            position: 'absolute',
                            top: Math.max(0, Math.min(
                                CARD_HEIGHT * STAMP_BOX_CENTER_Y - TAMPON_HEIGHT / 2 + stampOffsets.tamponDy,
                                CARD_HEIGHT - TAMPON_HEIGHT
                            )),
                            left: Math.max(0, Math.min(
                                CARD_WIDTH * STAMP_BOX_CENTER_X - TAMPON_WIDTH * 0.72 + stampOffsets.tamponDx,
                                CARD_WIDTH - TAMPON_WIDTH
                            )),
                            width: TAMPON_WIDTH,
                            height: TAMPON_HEIGHT,
                            transform: [{ rotate: `${stampOffsets.tamponRot}deg` }],
                            opacity: 0.7,
                            overflow: 'hidden',
                        }}>
                            <Image
                                source={require('../assets/images/tampon.png')}
                                style={{ width: '100%', height: '100%' }}
                                resizeMode="contain"
                            />
                        </View>
                    </ImageBackground>
                </View>
            </View>
        </View>
    );
}
