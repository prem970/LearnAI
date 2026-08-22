import { v2 as cloudinary } from 'cloudinary'

function configured() {
  const url = process.env.CLOUDINARY_URL
  if (!url) return false
  cloudinary.config({ secure: true })
  return true
}

export async function uploadTeacherAvatar(buffer, userId) {
  if (!configured()) {
    const err = new Error('CLOUDINARY_URL is not configured.')
    err.status = 500
    throw err
  }

  const result = await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: `learnai/teachers/${userId}/avatar`,
        overwrite: true,
        transformation: [{ width: 512, height: 512, crop: 'fill' }],
      },
      (error, uploaded) => {
        if (error) reject(error)
        else resolve(uploaded)
      },
    )
    stream.end(buffer)
  })

  return {
    avatarUrl: result.secure_url,
    publicId: result.public_id,
  }
}
