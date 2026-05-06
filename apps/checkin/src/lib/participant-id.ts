export const PARTICIPANT_ID_PATTERN = /^\d{5}$/;

export const participantProfilePath = (participantId: string): string =>
  `/reception/participants/${participantId}`;
