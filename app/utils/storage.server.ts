import {
	GetObjectCommand,
	PutObjectCommand,
	S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { type FileUpload } from '@mjackson/form-data-parser'
import { createId } from '@paralleldrive/cuid2'

const STORAGE_BUCKET = process.env.AWS_S3_BUCKET
const STORAGE_REGION = process.env.AWS_REGION

const s3 = new S3Client({ region: STORAGE_REGION })

async function uploadToStorage(file: File | FileUpload, key: string) {
	const uploadDate = new Date().toISOString()

	try {
		await s3.send(
			new PutObjectCommand({
				Bucket: STORAGE_BUCKET,
				Key: key,
				Body: new Uint8Array(await file.arrayBuffer()),
				ContentType: file.type,
				Metadata: { 'upload-date': uploadDate },
			}),
		)
	} catch (error) {
		console.error(`Failed to upload object: ${key}`, error)
		throw new Error(`Failed to upload object: ${key}`, { cause: error })
	}

	return key
}

export async function uploadProfileImage(
	userId: string,
	file: File | FileUpload,
) {
	const fileId = createId()
	const fileExtension = file.name.split('.').pop() || ''
	const timestamp = Date.now()
	const key = `users/${userId}/profile-images/${timestamp}-${fileId}.${fileExtension}`
	return uploadToStorage(file, key)
}

export async function uploadNoteImage(
	userId: string,
	noteId: string,
	file: File | FileUpload,
) {
	const fileId = createId()
	const fileExtension = file.name.split('.').pop() || ''
	const timestamp = Date.now()
	const key = `users/${userId}/notes/${noteId}/images/${timestamp}-${fileId}.${fileExtension}`
	return uploadToStorage(file, key)
}

export function getSignedGetUrl(key: string) {
	return getSignedUrl(
		s3,
		new GetObjectCommand({
			Bucket: STORAGE_BUCKET,
			Key: key,
		}),
		{ expiresIn: 60 },
	)
}
