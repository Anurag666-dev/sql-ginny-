import hashlib
import math
from typing import List


def get_text_embedding(text: str, dim: int = 384) -> List[float]:
    """
    Produces a deterministic, normalized 384-dimensional vector embedding
    for pgvector cosine similarity search (<=>).
    """
    clean_text = text.strip().lower()
    if not clean_text:
        return [0.0] * dim

    words = clean_text.split()
    vec = [0.0] * dim

    for word in words:
        h = int(hashlib.sha256(word.encode("utf-8")).hexdigest(), 16)
        for i in range(dim):
            bit = (h >> (i % 64)) & 1
            val = 1.0 if bit == 1 else -1.0
            vec[i] += val * (1.0 / (1.0 + (i % 7)))

    norm = math.sqrt(sum(x * x for x in vec))
    if norm > 0:
        vec = [round(x / norm, 6) for x in vec]

    return vec
