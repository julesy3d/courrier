import { Dimensions } from 'react-native';

const { width: windowWidth } = Dimensions.get('window');

// Main card dimensions
export const HORIZONTAL_PADDING = 40;
export const CARD_WIDTH = windowWidth - (HORIZONTAL_PADDING * 2);
export const CARD_ASPECT_RATIO = 297 / 422;
export const CARD_HEIGHT = CARD_WIDTH / CARD_ASPECT_RATIO;
export const IMAGE_INSET = 20; // Padding around the inset image on the recto

// Verso layout zones — match the baked texture positions
export const VERSO_MESSAGE_TOP = 0.230;
export const VERSO_MESSAGE_BOTTOM = 0.745;
export const VERSO_RECIPIENT_NAME_Y = 0.798;
export const VERSO_RECIPIENT_ADDR_Y = 0.863;
export const VERSO_CONTENT_LEFT = 0.145;
export const VERSO_CONTENT_RIGHT = 0.855;

// Stamp box position (for stamp/postmark overlay)
// Center of stamp box: x 0.747–0.955, y 0.030–0.203
export const STAMP_BOX_CENTER_X = 0.851;
export const STAMP_BOX_CENTER_Y = 0.116;

// Stamp and postmark dimensions
export const STAMP_WIDTH = CARD_WIDTH * 0.285;    // fits inside stamp box
export const STAMP_HEIGHT = STAMP_WIDTH * 1.25;

export const TAMPON_ASPECT = 280 / 120;
export const TAMPON_HEIGHT = STAMP_HEIGHT * 0.74;
export const TAMPON_WIDTH = TAMPON_HEIGHT * TAMPON_ASPECT;
