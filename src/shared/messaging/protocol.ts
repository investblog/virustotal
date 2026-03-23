export interface CheckDomainRequest {
  type: 'CHECK_DOMAIN';
  domain: string;
}

export interface AddDomainRequest {
  type: 'ADD_DOMAIN';
  domain: string;
}

export interface RemoveDomainRequest {
  type: 'REMOVE_DOMAIN';
  domain: string;
}

export interface CheckAllRequest {
  type: 'CHECK_ALL';
}

export interface VerifyKeyRequest {
  type: 'VERIFY_KEY';
  key: string;
}

export interface GetQueueStatusRequest {
  type: 'GET_QUEUE_STATUS';
}

export interface OpenSidepanelRequest {
  type: 'OPEN_SIDEPANEL';
}

export type RequestMessage =
  | CheckDomainRequest
  | AddDomainRequest
  | RemoveDomainRequest
  | CheckAllRequest
  | VerifyKeyRequest
  | GetQueueStatusRequest
  | OpenSidepanelRequest;

export interface DomainActionResponse {
  ok: boolean;
}

export interface VerifyKeyResponse {
  ok: boolean;
  error?: string;
}

export interface QueueStatusResponse {
  length: number;
  processing: string | null;
}

export type ResponseMap = {
  CHECK_DOMAIN: DomainActionResponse;
  ADD_DOMAIN: DomainActionResponse;
  REMOVE_DOMAIN: DomainActionResponse;
  CHECK_ALL: DomainActionResponse;
  VERIFY_KEY: VerifyKeyResponse;
  GET_QUEUE_STATUS: QueueStatusResponse;
  OPEN_SIDEPANEL: void;
};

export function sendMessage<T extends RequestMessage>(
  message: T,
): Promise<ResponseMap[T['type']]> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: ResponseMap[T['type']]) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}
