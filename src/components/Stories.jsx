import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../context/useAuth'
import { apiFetch } from '../api/client'
import { uploadImageToCloudinary } from '../utils/cloudinary'
import '../styles/Stories.css'

const STORY_TTL_MS = 24 * 60 * 60 * 1000

function isValidHttpUrl(value) {
  try {
    const parsedUrl = new URL(String(value).trim())
    return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:'
  } catch {
    return false
  }
}

function getInitials(label = '') {
  const parts = String(label).trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'U'
  return parts.slice(0, 2).map(part => part[0]).join('').toUpperCase()
}

function getStoryAuthor(story, currentUser) {
  if (story.userId === currentUser?.id) {
    return currentUser?.fullName || currentUser?.username || 'You'
  }

  return story.user?.fullName || story.user?.username || 'User'
}

function mapStory(story, currentUser) {
  const createdAt = new Date(story.createdAt)
  const author = getStoryAuthor(story, currentUser)

  return {
    ...story,
    image: story.imageUrl,
    author,
    avatarLabel: getInitials(author),
    createdAt,
    expiresAt: new Date(createdAt.getTime() + STORY_TTL_MS),
    isMine: story.userId === currentUser?.id
  }
}

function getTimeAgo(date) {
  const diff = Date.now() - date.getTime()
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (seconds < 60) return 'just now'
  if (minutes < 60) return `${minutes}m`
  if (hours < 24) return `${hours}h`
  return '24h+'
}

function getTimeRemaining(expiresAt, nowMs) {
  const diff = expiresAt.getTime() - nowMs

  if (diff <= 0) return 'Expired'

  const hours = Math.floor(diff / (1000 * 60 * 60))
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
  return `${hours}h ${minutes}m`
}

export default function Stories() {
  const { currentUser } = useAuth()
  const fileInputRef = useRef(null)
  const [stories, setStories] = useState([])
  const [storyUrl, setStoryUrl] = useState('')
  const [selectedFile, setSelectedFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [selectedStoryId, setSelectedStoryId] = useState(null)
  const [nowMs, setNowMs] = useState(Date.now())

  const loadStories = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const data = await apiFetch('/api/stories')
      const mappedStories = (data.stories || []).map(story => mapStory(story, currentUser))
      setStories(mappedStories)
    } catch (err) {
      setError(err.message)
      setStories([])
    } finally {
      setLoading(false)
    }
  }, [currentUser])

  useEffect(() => {
    loadStories()
  }, [loadStories])

  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now())
    }, 60000)

    return () => clearInterval(timer)
  }, [])

  const visibleStories = useMemo(() => {
    return stories.filter(story => story.expiresAt.getTime() > nowMs)
  }, [stories, nowMs])

  const selectedStory = useMemo(() => {
    return visibleStories.find(story => story.id === selectedStoryId) || null
  }, [visibleStories, selectedStoryId])

  useEffect(() => {
    if (selectedStoryId && !selectedStory) {
      setSelectedStoryId(null)
    }
  }, [selectedStory, selectedStoryId])

  const handleDeleteStory = useCallback(async (storyId) => {
    setError('')

    setStories(prevStories => prevStories.filter(story => story.id !== storyId))
    if (selectedStoryId === storyId) {
      setSelectedStoryId(null)
    }

    try {
      await apiFetch(`/api/stories/${storyId}`, { method: 'DELETE' })
    } catch (err) {
      setError(err.message)
      await loadStories()
    }
  }, [loadStories, selectedStoryId])

  const resetStoryForm = useCallback(() => {
    setStoryUrl('')
    setSelectedFile(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [])

  const handleChooseFile = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
      fileInputRef.current.click()
    }
  }, [])

  const handleFileChange = useCallback((event) => {
    const nextFile = event.target.files?.[0] || null
    setSelectedFile(nextFile)
    setError('')
    event.target.value = ''
  }, [])

  const submitStory = useCallback(async ({ forceFileOnly = false } = {}) => {
    const trimmedUrl = storyUrl.trim()
    const hasUrl = !forceFileOnly && trimmedUrl.length > 0
    const hasFile = !!selectedFile

    if (!hasUrl && !hasFile) {
      setError('Choose a file or paste an image URL.')
      return
    }

    if (hasUrl && !isValidHttpUrl(trimmedUrl)) {
      setError('Please enter a valid http(s) image URL.')
      return
    }

    setIsSubmitting(true)
    setError('')

    try {
      console.log('Story upload start', {
        hasFile,
        hasUrl,
        selectedFileName: selectedFile?.name,
        selectedFileType: selectedFile?.type,
        selectedFileSize: selectedFile?.size,
        storyUrl: trimmedUrl
      })

      const finalImageUrl = hasFile
        ? await uploadImageToCloudinary(selectedFile)
        : trimmedUrl

      console.log('Story final image URL', finalImageUrl)

      const savedStory = await apiFetch('/api/stories', {
        method: 'POST',
        body: JSON.stringify({
          imageUrl: finalImageUrl,
          userId: currentUser?.id
        })
      })

      console.log('Story backend save response', savedStory)

      resetStoryForm()
      await loadStories()
    } catch (err) {
      console.error('Story upload failed', err)
      setError(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }, [currentUser?.id, loadStories, resetStoryForm, selectedFile, storyUrl])

  const handleAddStory = useCallback(async (event) => {
    event.preventDefault()
    await submitStory()
  }, [submitStory])

  const handleUploadSelectedFile = useCallback(async () => {
    if (!selectedFile || isSubmitting) return
    await submitStory({ forceFileOnly: true })
  }, [isSubmitting, selectedFile, submitStory])

  const handleStoryInputKeyDown = (event) => {
    if (event.key !== 'Enter' || event.shiftKey) return
    event.preventDefault()
    if (isSubmitting) return
    void handleAddStory(event)
  }

  const selectedStoryIndex = selectedStory
    ? visibleStories.findIndex(story => story.id === selectedStory.id)
    : -1

  return (
    <div className="stories-container">
      {!import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || !import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET ? (
        <p className="story-error">
          File upload is not configured. Add `VITE_CLOUDINARY_CLOUD_NAME` and `VITE_CLOUDINARY_UPLOAD_PRESET` to the root `.env`.
        </p>
      ) : null}
      {error && <p className="story-error">{error}</p>}
      {(loading || isSubmitting) && (
        <p className="story-loading">
          {isSubmitting ? 'Saving story...' : 'Loading stories...'}
        </p>
      )}

      {selectedStory ? (
        <div className="story-viewer">
          <button
            type="button"
            className="story-close"
            onClick={() => setSelectedStoryId(null)}
          >
            x
          </button>

          <div className="story-content">
            <div className="story-header-viewer">
              <div className="story-info">
                <span className="avatar">{selectedStory.avatarLabel}</span>
                <div>
                  <p className="author-name">{selectedStory.author}</p>
                  <p className="time-ago">{getTimeAgo(selectedStory.createdAt)} ago</p>
                </div>
              </div>

              <div className="story-actions">
                <span className="expiration">
                  Expires in {getTimeRemaining(selectedStory.expiresAt, nowMs)}
                </span>
                {selectedStory.isMine && (
                  <button
                    type="button"
                    className="delete-story-btn"
                    onClick={() => handleDeleteStory(selectedStory.id)}
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>

            <img
              src={selectedStory.image}
              alt={selectedStory.author}
              className="story-image"
            />

            <button
              type="button"
              className="story-nav prev"
              onClick={() => {
                if (selectedStoryIndex > 0) {
                  setSelectedStoryId(visibleStories[selectedStoryIndex - 1].id)
                }
              }}
              disabled={selectedStoryIndex <= 0}
            >
              {'<'}
            </button>

            <button
              type="button"
              className="story-nav next"
              onClick={() => {
                if (selectedStoryIndex < visibleStories.length - 1) {
                  setSelectedStoryId(visibleStories[selectedStoryIndex + 1].id)
                }
              }}
              disabled={selectedStoryIndex === -1 || selectedStoryIndex >= visibleStories.length - 1}
            >
              {'>'}
            </button>
          </div>
        </div>
      ) : (
        <>
          <form onSubmit={handleAddStory} className="story-upload-form">
            <div className="story-upload-row">
              <button
                type="button"
                onClick={handleChooseFile}
                disabled={isSubmitting}
                className="story-select-btn"
              >
                Choose File
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />

              <span className="story-file-name">
                {selectedFile ? selectedFile.name : 'No file selected'}
              </span>

              <button
                type="button"
                onClick={handleUploadSelectedFile}
                disabled={!selectedFile || isSubmitting}
                className="story-upload-btn"
              >
                {isSubmitting && selectedFile ? 'Uploading Story...' : 'Upload Story'}
              </button>
            </div>

            <div className="story-upload-row story-upload-row-secondary">
              <input
                type="url"
                value={storyUrl}
                onChange={(event) => {
                  setStoryUrl(event.target.value)
                  if (error) {
                    setError('')
                  }
                }}
                onKeyDown={handleStoryInputKeyDown}
                placeholder="Paste Image URL"
                disabled={isSubmitting}
                className="story-url-input"
              />

              <button
                type="submit"
                disabled={isSubmitting}
                className="story-submit-btn"
              >
                {isSubmitting && !selectedFile ? 'Adding Story...' : 'Add Story'}
              </button>
            </div>

            <p className="story-helper-text">
              Paste an image URL or choose a file. If both are provided, the uploaded file is used.
            </p>
            {selectedFile ? (
              <p className="story-helper-text">
                File selected. Click Upload Story to upload it.
              </p>
            ) : null}
          </form>

          <div className="stories-list">
            {visibleStories.map(story => (
              <div
                key={story.id}
                className="story-card"
                onClick={() => setSelectedStoryId(story.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    setSelectedStoryId(story.id)
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <div className="story-ring">
                  <img
                    src={story.image}
                    alt={story.author}
                    className="story-thumbnail"
                  />
                </div>
                <p className="story-name">{story.author}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
