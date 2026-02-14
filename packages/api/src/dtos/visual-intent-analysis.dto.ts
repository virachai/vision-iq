export interface CoreIntent {
  intent: string;
  visual_goal: string;
}

export interface SpatialStrategy {
  shot_type: string;
  negative_space: string;
  balance: string;
}

export interface SubjectTreatment {
  identity: string;
  dominance: string;
  eye_contact: string;
}

export interface ColorPsychology {
  palette: string[];
  contrast: string;
  mood: string;
}

export interface EmotionalArchitecture {
  vibe: string;
  rhythm: string;
  intensity: string;
}

export interface MetaphoricalLayer {
  objects: string[];
  meaning: string;
}

export interface CinematicLeverage {
  angle: string;
  lighting: string;
  sound: string;
}

export interface VisualIntentAnalysisDto {
  coreIntent: CoreIntent;
  spatialStrategy: SpatialStrategy;
  subjectTreatment: SubjectTreatment;
  colorPsychology: ColorPsychology;
  emotionalArchitecture: EmotionalArchitecture;
  metaphoricalLayer: MetaphoricalLayer;
  cinematicLeverage: CinematicLeverage;
}
