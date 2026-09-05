# Knowledge graph

Source: [`src/lexflow/graph/`](../../src/lexflow/graph/). Backed by
[NetworkX](https://networkx.org/) `DiGraph`.

## Model — [`graph/model.py`](../../src/lexflow/graph/model.py)

```python
class LegalGraph:
    def add_law(self, metadata: LawMetadata) -> None: ...
    def add_reference(self, source_id, target_id, *, source_article=None, reference_text="") -> None: ...
    def get_neighbors(self, law_id: str) -> list[str]: ...        # successors (outgoing references)
    def get_subgraph(self, law_id: str, depth: int = 1) -> nx.DiGraph: ...  # both directions
    def node_count(self) -> int
    def edge_count(self) -> int
    @property
    def graph(self) -> nx.DiGraph                                # escape hatch for algorithm code
```

Nodes carry `title`, `rank`, `status`, `scope`, `jurisdiction`,
`publication_date` as attributes (string-serialised), plus build-time
`pagerank` (float) and `community` (int) written by
`enrich_graph_analytics`. Edges carry `source_article`, `reference_text`,
`kind`.

`add_reference` silently ignores edges whose endpoints are not in the graph
yet — the builder relies on this for forward references.

`get_subgraph` caps ego-expansion at `MAX_SUBGRAPH_NODES` (250). Overflow
candidates are ranked by persisted PageRank, with degree as the tiebreaker.

## Builder — [`graph/builder.py`](../../src/lexflow/graph/builder.py)

```python
def build_graph(registry: LawRegistry) -> LegalGraph:
    # Pass 1: add every law as a node using fast metadata-only parse.
    # Pass 2: walk every law fully, add edges for resolvable references.
    # Pass 3: persist PageRank + community on every node.
```

Pass 1 is cheap (frontmatter only). Pass 2 is the expensive part — it
triggers full parses for every law. Pass 3 (`enrich_graph_analytics`) runs
once per build / incremental `apply_diff_to_graph` so request handlers
read scores from node attrs instead of recomputing `nx.pagerank`.

In the request lifecycle the graph is loaded lazily on the first `/graph/*`
call via `get_graph` in `src/lexflow/api/dependencies.py`, which calls
`load_or_build`.

## Algorithms — [`graph/algorithms.py`](../../src/lexflow/graph/algorithms.py)

| Function | Returns |
|----------|---------|
| `pagerank(graph, alpha=0.85)` | `dict[str, float]` |
| `top_laws(graph, n=10)` | `list[tuple[str, float]]` sorted desc; prefers persisted attrs |
| `shortest_path(graph, source, target)` | `list[str]`; raises `nx.NetworkXNoPath` |
| `community_detection(graph)` | `dict[str, int]` (greedy modularity, undirected projection) |
| `enrich_graph_analytics(graph)` | writes `pagerank` + `community` onto every node |

The router catches `NetworkXNoPath` and `NodeNotFound` from `shortest_path`
and returns 404. `GET /api/v1/graph` (global) sorts/truncates by persisted
PageRank and returns truncation metadata (`truncated`, `limit_applied`,
`returned_count`, `total_available`). `GET /api/v1/graph/subgraph/{id}`
still computes neighbourhood-scoped PageRank so scores sum to ~1 in the
visible set.

## Cache — [`graph/cache.py`](../../src/lexflow/graph/cache.py)

The graph build over the full corpus is slow. The cache writes the graph as
JSON (NetworkX `node_link_data`) to `data/graph_cache.json`, keyed by the
HEAD commit of the `data/legalize-es` submodule.

```python
def load_or_build(registry: LawRegistry, data_path: Path) -> LegalGraph:
    # load cache; if hash matches → return
    # else → build, save, return
```

`CACHE_VERSION = "5"` — bump this constant when the builder output changes
(new node attrs, citation resolution, analytics). Old caches with a
mismatched version are discarded on load. Node attrs (including PageRank
and community) round-trip through `node_link_data` / `node_link_graph`.

`load_or_build` is wired through `get_graph` in
`src/lexflow/api/dependencies.py`. Unknown corpus revisions
(`UNKNOWN_REVISION`) bypass the cache and still run analytics on the
fresh build.

## Where things live

| You want to… | Edit |
|--------------|------|
| Add a new node attribute | `LegalGraph.add_law` + the metadata_parser |
| Add a new edge attribute | `LegalGraph.add_reference` + the parser that emits `Reference` |
| Add a new algorithm endpoint | `algorithms.py` + `routers/graph.py` |
| Persist PageRank / communities | `algorithms.enrich_graph_analytics` (called from `builder.py`) |
| Change cache schema | `cache.py:CACHE_VERSION` + the serialiser |
| Persist the cache automatically | already wired in `api/dependencies.py:get_graph` |
