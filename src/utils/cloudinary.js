export async function uploadImageToCloudinary(file) {
  const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME
  const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET

  if (!cloudName || !uploadPreset) {
    throw new Error('Missing Cloudinary config: VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET')
  }

  const form = new FormData()
  form.append('file', file)
  form.append('upload_preset', uploadPreset)

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: 'POST',
    body: form
  })

  if (!response.ok) {
    throw new Error('Cloudinary upload failed')
  }

  const payload = await response.json()
  if (!payload.secure_url) {
    throw new Error('Cloudinary did not return secure_url')
  }

  return payload.secure_url
}
