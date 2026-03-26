export async function uploadImageToCloudinary(file) {
  const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME
  const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET

  console.log('Cloudinary env', {
    cloudName,
    uploadPreset,
    fileName: file?.name,
    fileType: file?.type,
    fileSize: file?.size
  })

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

  let payload = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  console.log('Cloudinary upload response', {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    payload
  })

  if (!response.ok) {
    throw new Error(payload?.error?.message || 'Cloudinary upload failed')
  }

  if (!payload.secure_url) {
    throw new Error('Cloudinary did not return secure_url')
  }

  return payload.secure_url
}
