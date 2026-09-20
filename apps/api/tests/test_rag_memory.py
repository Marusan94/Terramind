"""MemoryRagStore: mismo contrato, sin Postgres."""
import pytest

from app.rag.embeddings import HashEmbedder
from app.rag.ingest import ingest_bytes
from app.rag.memory import MemoryRagStore
from app.rag.seed import seed_demo_docs


def _store():
    return MemoryRagStore(HashEmbedder())


@pytest.mark.asyncio
async def test_seed_ingests_demo_docs():
    store = _store()
    out = await seed_demo_docs(store, HashEmbedder())
    assert len(out) == 4
    assert all(d['chunks'] >= 1 for d in out)
    docs = await store.list_documents()
    assert {'siata', 'gobierno', 'oms', 'ods'} <= {d.source for d in docs}


@pytest.mark.asyncio
async def test_memory_search_ranks_and_filters():
    store = _store()
    await seed_demo_docs(store, HashEmbedder())
    hits = await store.search('inversion termica marzo', top_k=5, min_score=0.05)
    assert hits
    assert hits[0].score >= hits[-1].score
    siata = await store.search('inversion termica', sources=['siata'], min_score=0.05)
    assert siata and all(h.source == 'siata' for h in siata)


@pytest.mark.asyncio
async def test_memory_upsert_delete_and_ingest_bytes():
    store = _store()
    emb = HashEmbedder()
    first = await ingest_bytes(
        store, emb, title='Doc', source='ods', kind='plan',
        filename='a.txt', data='Objetivos de desarrollo sostenible aire limpio. '.encode(),
        external_id='demo:x',
    )
    again = await ingest_bytes(
        store, emb, title='Doc', source='ods', kind='plan',
        filename='a.txt', data='Objetivos de desarrollo sostenible aire limpio. '.encode(),
        external_id='demo:x',
    )
    assert first['doc_id'] != again['doc_id']
    assert len(await store.list_documents()) == 1
    assert await store.delete_document(again['doc_id']) is True
    assert await store.delete_document('no-existe') is False