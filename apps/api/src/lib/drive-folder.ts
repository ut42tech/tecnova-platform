export interface DriveFolderWebhookConfig {
  url: string;
  secret: string;
}

export interface ParticipantDriveFolderResult {
  folderId: string;
  folderName: string;
  reused: boolean;
}

interface CreateParticipantDriveFolderInput extends DriveFolderWebhookConfig {
  participantId: string;
  nickname: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const readJsonResponse = async (resp: Response): Promise<unknown> => {
  const text = await resp.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`GAS Drive webhook returned non-JSON (${resp.status}): ${text.slice(0, 500)}`);
  }
};

export const createParticipantDriveFolder = async ({
  url,
  secret,
  participantId,
  nickname,
}: CreateParticipantDriveFolderInput): Promise<ParticipantDriveFolderResult> => {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret, participantId, nickname }),
  });

  const data = await readJsonResponse(resp);

  if (!resp.ok) {
    throw new Error(`GAS Drive webhook failed with HTTP ${resp.status}: ${JSON.stringify(data)}`);
  }

  if (!isRecord(data) || data.ok !== true) {
    const message = isRecord(data)
      ? (data.error ?? data.message ?? JSON.stringify(data))
      : JSON.stringify(data);
    throw new Error(`GAS Drive webhook rejected request: ${String(message)}`);
  }

  if (typeof data.folderId !== 'string') {
    throw new Error(`GAS Drive webhook returned invalid payload: ${JSON.stringify(data)}`);
  }

  return {
    folderId: data.folderId,
    folderName:
      typeof data.folderName === 'string' ? data.folderName : `${participantId}_${nickname}`,
    reused: data.reused === true,
  };
};
