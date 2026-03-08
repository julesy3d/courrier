export function seededRandom(seed: string): () => number {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        const char = seed.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0;
    }
    return () => {
        hash = (hash * 16807 + 0) % 2147483647;
        if (hash < 0) hash += 2147483647;
        return (hash - 1) / 2147483646;
    };
}
