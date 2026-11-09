export interface InterviewRequest {
  interviewId: string;
  candidateId: string;
  question: string;
  transcript: string;
  durationSeconds: number;
  startedAt: string;
  finishedAt: string;
}

export interface InterviewResponse {
  interviewId: string;
  candidateId: string;
  communicationScore: number;
  confidenceScore: number;
  recommendation: string;
}
