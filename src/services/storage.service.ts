import { supabase } from '../config/supabase';
import { STORAGE_BUCKET, STORAGE_MAX_FILE_SIZE, STORAGE_ALLOWED_TYPES } from '../constants';
import { buildError, HTTP_STATUS } from '../constants/errors';

interface UploadProofInput {
  drawId: string;
  userId: string;
  file: Express.Multer.File;
}

interface UploadProofResult {
  publicUrl: string;
  path: string;
}

/**
 * Validates and uploads a proof-of-identity image to Supabase Storage.
 * Path pattern: proofs/{drawId}/{userId}/{timestamp}.{ext}
 * Max 5MB. Allowed types: jpeg, png, webp.
 */
export const uploadWinnerProof = async (
  input: UploadProofInput
): Promise<UploadProofResult> => {
  const { drawId, userId, file } = input;

  // Validate file size
  if (file.size > STORAGE_MAX_FILE_SIZE) {
    throw buildError('PROOF_FILE_TOO_LARGE', HTTP_STATUS.BAD_REQUEST);
  }

  // Validate file type
  const allowedTypesArr: readonly string[] = STORAGE_ALLOWED_TYPES;
  if (!allowedTypesArr.includes(file.mimetype)) {
    throw buildError('PROOF_FILE_TYPE_INVALID', HTTP_STATUS.BAD_REQUEST);
  }

  const ext = file.originalname.split('.').pop() ?? 'jpg';
  const timestamp = Date.now();
  const path = `proofs/${drawId}/${userId}/${timestamp}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, file.buffer, {
      contentType: file.mimetype,
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`Storage upload failed: ${uploadError.message}`);
  }

  const { data: urlData } = supabase.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(path);

  return { publicUrl: urlData.publicUrl, path };
};
