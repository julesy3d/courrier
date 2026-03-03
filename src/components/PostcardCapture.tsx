import React, { useMemo } from 'react';
import { Dimensions, Image, ImageBackground, StyleSheet, Text, View } from 'react-native';

interface PostcardCaptureProps {
    imageUri: string | null;       // The photo on the recto
    body: string;                  // Message text
    fromName: string;              // Sender display name
    toName: string;                // Recipient display name
    fromAddress: string;           // Sender's vanity address
    toAddress: string;             // Recipient's address (or placeholder text)
    rectoRef: React.Ref<View>;   // Ref for capturing recto
    versoRef: React.Ref<View>;   // Ref for capturing verso
    compositeRef: React.Ref<View>; // Ref for capturing composite
}

const { width: windowWidth } = Dimensions.get('window');
const HORIZONTAL_PADDING = 40;
const CARD_WIDTH = windowWidth - (HORIZONTAL_PADDING * 2);
const CARD_ASPECT_RATIO = 297 / 422;
const CARD_HEIGHT = CARD_WIDTH / CARD_ASPECT_RATIO;
const IMAGE_INSET = 20;

const STAMP_CENTER_X_RATIO = (297 - 40) / 297;
const STAMP_CENTER_Y_RATIO = 44 / 422;
const STAMP_WIDTH = CARD_WIDTH * 0.264;
const STAMP_HEIGHT = STAMP_WIDTH * 1.25;
const TAMPON_ASPECT = 280 / 120;
const TAMPON_HEIGHT = STAMP_HEIGHT * 0.74;
const TAMPON_WIDTH = TAMPON_HEIGHT * TAMPON_ASPECT;

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
    fromName,
    toName,
    fromAddress,
    toAddress,
    rectoRef,
    versoRef,
    compositeRef
}: PostcardCaptureProps) {
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
                    source={require('../assets/images/lettreMAIN_rectoretouche1_0.png')}
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
                    source={require('../assets/images/lettreMAIN_versoretouche1_1.png')}
                    style={{ width: '100%', height: '100%', overflow: 'hidden' }}
                    resizeMode="cover"
                >
                    {/* Body text */}
                    <View style={{
                        flex: 1,
                        paddingTop: CARD_HEIGHT * 0.25,
                        paddingHorizontal: 20,
                        paddingBottom: 16,
                    }}>
                        <View style={{ flex: 1, marginBottom: 12 }}>
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

                        {/* Address zone */}
                        <View style={{
                            height: CARD_HEIGHT * 0.35,
                            borderTopWidth: StyleSheet.hairlineWidth,
                            borderTopColor: 'rgba(128,128,128,0.25)',
                            paddingTop: 10,
                        }}>
                            <View style={{ flexDirection: 'row', flex: 1 }}>
                                {/* FROM */}
                                <View style={{ flex: 1, paddingRight: 10 }}>
                                    <Text style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>De:</Text>
                                    {fromName ? (
                                        <Text style={{ fontFamily: 'Georgia', fontSize: 14, color: '#1a1a1a' }}>
                                            {fromName}
                                        </Text>
                                    ) : null}
                                    <Text style={{
                                        fontFamily: 'Georgia',
                                        fontSize: fromName ? 11 : 14,
                                        color: '#1a1a1a',
                                        ...(fromName ? { marginTop: 2 } : {}),
                                    }}>
                                        {fromAddress}
                                    </Text>
                                </View>

                                <View style={{ width: 20 }} />

                                {/* TO */}
                                <View style={{ flex: 1, paddingLeft: 10 }}>
                                    <Text style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>A:</Text>
                                    {toName ? (
                                        <Text style={{ fontFamily: 'Georgia', fontSize: 14, color: '#1a1a1a' }}>
                                            {toName}
                                        </Text>
                                    ) : null}
                                    <Text style={{
                                        fontFamily: 'Georgia',
                                        fontSize: toName ? 11 : 14,
                                        color: '#1a1a1a',
                                        ...(toName ? { marginTop: 2 } : {}),
                                    }}>
                                        {toAddress || 'adresse a venir'}
                                    </Text>
                                </View>
                            </View>
                        </View>
                    </View>

                    {/* STAMP */}
                    <View style={{
                        position: 'absolute',
                        top: CARD_HEIGHT * STAMP_CENTER_Y_RATIO - STAMP_HEIGHT / 2 + stampOffsets.stampDy,
                        left: CARD_WIDTH * STAMP_CENTER_X_RATIO - STAMP_WIDTH / 2 + stampOffsets.stampDx,
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
                            CARD_HEIGHT * STAMP_CENTER_Y_RATIO - TAMPON_HEIGHT / 2 + stampOffsets.tamponDy,
                            CARD_HEIGHT - TAMPON_HEIGHT
                        )),
                        left: Math.max(0, Math.min(
                            CARD_WIDTH * STAMP_CENTER_X_RATIO - TAMPON_WIDTH * 0.72 + stampOffsets.tamponDx,
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
                        source={require('../assets/images/lettreMAIN_rectoretouche1_0.png')}
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
                        source={require('../assets/images/lettreMAIN_versoretouche1_1.png')}
                        style={{ width: '100%', height: '100%', overflow: 'hidden' }}
                        resizeMode="cover"
                    >
                        {/* Body text */}
                        <View style={{
                            flex: 1,
                            paddingTop: CARD_HEIGHT * 0.25,
                            paddingHorizontal: 20,
                            paddingBottom: 16,
                        }}>
                            <View style={{ flex: 1, marginBottom: 12 }}>
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

                            {/* Address zone */}
                            <View style={{
                                height: CARD_HEIGHT * 0.35,
                                borderTopWidth: StyleSheet.hairlineWidth,
                                borderTopColor: 'rgba(128,128,128,0.25)',
                                paddingTop: 10,
                            }}>
                                <View style={{ flexDirection: 'row', flex: 1 }}>
                                    {/* FROM */}
                                    <View style={{ flex: 1, paddingRight: 10 }}>
                                        <Text style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>De:</Text>
                                        {fromName ? (
                                            <Text style={{ fontFamily: 'Georgia', fontSize: 14, color: '#1a1a1a' }}>
                                                {fromName}
                                            </Text>
                                        ) : null}
                                        <Text style={{
                                            fontFamily: 'Georgia',
                                            fontSize: fromName ? 11 : 14,
                                            color: '#1a1a1a',
                                            ...(fromName ? { marginTop: 2 } : {}),
                                        }}>
                                            {fromAddress}
                                        </Text>
                                    </View>

                                    <View style={{ width: 20 }} />

                                    {/* TO */}
                                    <View style={{ flex: 1, paddingLeft: 10 }}>
                                        <Text style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>A:</Text>
                                        {toName ? (
                                            <Text style={{ fontFamily: 'Georgia', fontSize: 14, color: '#1a1a1a' }}>
                                                {toName}
                                            </Text>
                                        ) : null}
                                        <Text style={{
                                            fontFamily: 'Georgia',
                                            fontSize: toName ? 11 : 14,
                                            color: '#1a1a1a',
                                            ...(toName ? { marginTop: 2 } : {}),
                                        }}>
                                            {toAddress || 'adresse a venir'}
                                        </Text>
                                    </View>
                                </View>
                            </View>
                        </View>

                        {/* STAMP */}
                        <View style={{
                            position: 'absolute',
                            top: CARD_HEIGHT * STAMP_CENTER_Y_RATIO - STAMP_HEIGHT / 2 + stampOffsets.stampDy,
                            left: CARD_WIDTH * STAMP_CENTER_X_RATIO - STAMP_WIDTH / 2 + stampOffsets.stampDx,
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
                                CARD_HEIGHT * STAMP_CENTER_Y_RATIO - TAMPON_HEIGHT / 2 + stampOffsets.tamponDy,
                                CARD_HEIGHT - TAMPON_HEIGHT
                            )),
                            left: Math.max(0, Math.min(
                                CARD_WIDTH * STAMP_CENTER_X_RATIO - TAMPON_WIDTH * 0.72 + stampOffsets.tamponDx,
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
