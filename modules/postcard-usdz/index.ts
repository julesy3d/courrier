import PostcardUsdzModule from "./src/PostcardUsdzModule";

export async function generateUSDZ(
    rectoUri: string,
    versoUri: string
): Promise<string> {
    return await PostcardUsdzModule.generateUSDZ(rectoUri, versoUri);
}

export async function shareViaIMessage(
    usdzPath: string,
    messageText: string,
    filename: string
): Promise<{ status: string }> {
    return await PostcardUsdzModule.shareViaIMessage(usdzPath, messageText, filename);
}