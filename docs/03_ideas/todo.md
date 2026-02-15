# Scene Clustering Implementation TODO

## Phase 1: Prototype "Filter then Cluster"

- [x] **Data Gathering & Analysis**

  - [x] Run `SemanticMatchingService` on 5 sample scenes to generate baseline results. (Mocked due to API key)
  - [x] Extract `MoodDNA` (color temp, dominance) for top 50 candidates per scene.
  - [x] Manually verify if grouping by `MoodDNA` creates coherent clusters.

- [x] **Implementation: `ClusteringService`**

  - [x] Create `ClusteringService` (or method in `SemanticMatchingService`).
  - [x] Implement `groupCandidatesByMood(candidates: VectorSearchResult[])`.
    - Logic: Group by `temperature` (Warm/Cool) AND `primary_color` (Red, Blue, etc.).
  - [x] Implement `selectBestCluster(clusters, prevSceneMood)`.
    - Logic: Prefer cluster that minimizes distance to `prevSceneMood`.

- [x] **Integration**

  - [x] Modify `SemanticMatchingService.findAlignedImages`:
    - Step 1: Fetch Top 100 via Vector Search (instead of Top 5).
    - Step 2: Run `ClusteringService.groupCandidatesByMood`.
    - Step 3: Select Winner Cluster.
    - Step 4: Return Top 5 from Winner Cluster.

- [x] **Validation**
  - [x] Compare "Cluster-Selected" sequence vs. "Greedy" sequence.
  - [x] Check if `80%` of visual jarring is removed by simple color grouping.
  - [x] **Success Metric:** Scene N and N+1 share dominant color palette in >70% of transitions.

## Phase 2: Full Vector Clustering (Conditional)

_Only proceed if Phase 1 fails to deliver sufficient coherence._

- [ ] Evaluate `k-means` node.js libraries for 768d vectors.
- [ ] Test performance impact of client-side clustering on 1000+ vectors.
