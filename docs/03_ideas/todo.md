# Scene Clustering Implementation TODO

## Phase 1: Prototype "Filter then Cluster"

- [ ] **Data Gathering & Analysis**

  - [ ] Run `SemanticMatchingService` on 5 sample scenes to generate baseline results.
  - [ ] Extract `MoodDNA` (color temp, dominance) for top 50 candidates per scene.
  - [ ] Manually verify if grouping by `MoodDNA` creates coherent clusters.

- [ ] **Implementation: `ClusteringService`**

  - [ ] Create `ClusteringService` (or method in `SemanticMatchingService`).
  - [ ] Implement `groupCandidatesByMood(candidates: VectorSearchResult[])`.
    - Logic: Group by `temperature` (Warm/Cool) AND `primary_color` (Red, Blue, etc.).
  - [ ] Implement `selectBestCluster(clusters, prevSceneMood)`.
    - Logic: Prefer cluster that minimizes distance to `prevSceneMood`.

- [ ] **Integration**

  - [ ] Modify `SemanticMatchingService.findAlignedImages`:
    - Step 1: Fetch Top 100 via Vector Search (instead of Top 5).
    - Step 2: Run `ClusteringService.groupCandidatesByMood`.
    - Step 3: Select Winner Cluster.
    - Step 4: Return Top 5 from Winner Cluster.

- [ ] **Validation**
  - [ ] Compare "Cluster-Selected" sequence vs. "Greedy" sequence.
  - [ ] Check if `80%` of visual jarring is removed by simple color grouping.
  - [ ] **Success Metric:** Scene N and N+1 share dominant color palette in >70% of transitions.

## Phase 2: Full Vector Clustering (Conditional)

_Only proceed if Phase 1 fails to deliver sufficient coherence._

- [ ] Evaluate `k-means` node.js libraries for 768d vectors.
- [ ] Test performance impact of client-side clustering on 1000+ vectors.
