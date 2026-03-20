import { useCallback, useEffect, useMemo, useState } from 'react'
import Post from './Post'
import Stories from './Stories'
import { apiFetch } from '../api/client'
import { useAuth } from '../context/AuthContext'
import '../styles/Feed.css'

/**
 * THEORY: Feed Component
 * ======================
 * The Feed component serves as a container that displays multiple posts.
 * It manages the global posts state and passes individual posts to Post components.
 * 
 * Key Concepts:
 * 1. State Management: Stores array of all posts
 * 2. Array Methods: .map() to render multiple posts from arrays
 * 3. Props Drilling: Passes handleLike, handleComment to child components
 */

export default function Feed() {
  const { currentUser } = useAuth()
  const [posts, setPosts] = useState([])
  const [pendingLikePostIds, setPendingLikePostIds] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [feedError, setFeedError] = useState('')
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [caption, setCaption] = useState('')
  const [imagesInput, setImagesInput] = useState('')
  const [selectedFiles, setSelectedFiles] = useState([])
  const [uploadingFiles, setUploadingFiles] = useState(false)
  const [posting, setPosting] = useState(false)

  const mapPost = useCallback((post) => {
    const comments = Array.isArray(post.comments)
      ? post.comments.map(comment => ({
          id: comment.id,
          userId: comment.userId,
          user: comment.author?.username || 'user',
          text: comment.text
        }))
      : []

    return {
      id: post.id,
      authorId: post.author?.id || '',
      author: post.author?.fullName || post.author?.username || 'Unknown',
      avatar: post.author?.profilePicture || '',
      username: post.author?.username || 'unknown',
      image: Array.isArray(post.images) && post.images.length > 0
        ? post.images[0]
        : 'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?w=1000&auto=format&fit=crop',
      images: post.images || [],
      caption: post.caption || '',
      likes: Number.isFinite(post.likesCount) ? post.likesCount : 0,
      liked: !!post.likedByMe,
      comments,
      timestamp: post.createdAt ? new Date(post.createdAt).toLocaleString() : 'Just now'
    }
  }, [])

  const loadFeed = useCallback(async () => {
    setIsLoading(true)
    setFeedError('')
    try {
      const data = await apiFetch('/api/posts/feed')
      setPosts((data.posts || []).map(mapPost))
    } catch (err) {
      setFeedError(err.message)
      setPosts([])
    } finally {
      setIsLoading(false)
    }
  }, [mapPost])

  useEffect(() => {
    loadFeed()
  }, [loadFeed])

  /**
   * THEORY: Event Handlers
   * =====================
   * These functions demonstrate immutable state updates in React.
   * Instead of modifying state directly, we create new state objects.
   */

  // Handler for liking/unliking posts
  const handleLike = async (postId) => {
    const target = posts.find(post => post.id === postId)
    if (!target) return
    if (pendingLikePostIds.includes(postId)) return

    setPendingLikePostIds(prev => [...prev, postId])

    try {
      if (target.liked) {
        const data = await apiFetch(`/api/posts/${postId}/like`, { method: 'DELETE' })
        setPosts(prev => prev.map(post =>
          post.id === postId ? { ...post, liked: false, likes: data.likesCount } : post
        ))
      } else {
        const data = await apiFetch(`/api/posts/${postId}/like`, { method: 'POST' })
        setPosts(prev => prev.map(post =>
          post.id === postId ? { ...post, liked: true, likes: data.likesCount } : post
        ))
      }
    } catch (err) {
      setFeedError(err.message || 'Failed to update like')
      await loadFeed()
    } finally {
      setPendingLikePostIds(prev => prev.filter(id => id !== postId))
    }
  }

  // Handler for adding comments
  const handleComment = async (postId, comment) => {
    try {
      const created = await apiFetch(`/api/posts/${postId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ text: comment.text })
      })

      setPosts(prev => prev.map(post =>
        post.id === postId
          ? {
              ...post,
              comments: [
                ...post.comments,
                {
                  id: created.id,
                  userId: currentUser?.id,
                  user: currentUser?.username || comment.user,
                  text: created.text
                }
              ]
            }
          : post
      ))

      await loadFeed()
      return true
    } catch (err) {
      setFeedError(err.message)
      return false
    }
  }

  const handleEditComment = async (commentId, postId, currentText) => {
    const nextText = window.prompt('Edit comment', currentText)
    if (nextText === null || !nextText.trim()) return

    try {
      const updated = await apiFetch(`/api/comments/${commentId}`, {
        method: 'PUT',
        body: JSON.stringify({ text: nextText.trim() })
      })

      setPosts(prev => prev.map(post =>
        post.id === postId
          ? {
              ...post,
              comments: post.comments.map(comment =>
                comment.id === commentId
                  ? { ...comment, text: updated.text }
                  : comment
              )
            }
          : post
      ))
    } catch (err) {
      setFeedError(err.message)
    }
  }

  const handleDeleteComment = async (commentId, postId) => {
    const confirmed = window.confirm('Delete this comment?')
    if (!confirmed) return

    try {
      await apiFetch(`/api/comments/${commentId}`, { method: 'DELETE' })
      setPosts(prev => prev.map(post =>
        post.id === postId
          ? {
              ...post,
              comments: post.comments.filter(comment => comment.id !== commentId)
            }
          : post
      ))
    } catch (err) {
      setFeedError(err.message)
    }
  }

  const parsedUrlImages = useMemo(() => {
    return imagesInput
      .split(',')
      .map(item => item.trim())
      .filter(Boolean)
  }, [imagesInput])

  const mergedImageCount = useMemo(() => {
    return parsedUrlImages.length + selectedFiles.length
  }, [parsedUrlImages.length, selectedFiles.length])

  const uploadToCloudinary = async (file) => {
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

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    setSelectedFiles(prev => [...prev, ...files].slice(0, 10))
  }

  const handleCreatePost = async (e) => {
    e.preventDefault()
    setFeedError('')

    if (mergedImageCount === 0) {
      setFeedError('Provide at least one image URL or upload image file')
      return
    }

    if (mergedImageCount > 10) {
      setFeedError('Maximum 10 images allowed')
      return
    }

    setPosting(true)
    setUploadingFiles(selectedFiles.length > 0)
    try {
      const uploadedUrls = selectedFiles.length > 0
        ? await Promise.all(selectedFiles.map(uploadToCloudinary))
        : []

      const finalImages = [...parsedUrlImages, ...uploadedUrls]

      await apiFetch('/api/posts', {
        method: 'POST',
        body: JSON.stringify({
          caption,
          images: finalImages
        })
      })

      setCaption('')
      setImagesInput('')
      setSelectedFiles([])
      setIsCreateModalOpen(false)
      await loadFeed()
    } catch (err) {
      setFeedError(err.message)
    } finally {
      setPosting(false)
      setUploadingFiles(false)
    }
  }

  const handleEditPost = async (postId) => {
    const post = posts.find(item => item.id === postId)
    if (!post) return

    const nextCaption = window.prompt('Edit caption', post.caption)
    if (nextCaption === null) return

    try {
      await apiFetch(`/api/posts/${postId}`, {
        method: 'PUT',
        body: JSON.stringify({ caption: nextCaption })
      })
      await loadFeed()
    } catch (err) {
      setFeedError(err.message)
    }
  }

  const handleDeletePost = async (postId) => {
    const confirmed = window.confirm('Delete this post?')
    if (!confirmed) return

    try {
      await apiFetch(`/api/posts/${postId}`, { method: 'DELETE' })
      setPosts(prev => prev.filter(post => post.id !== postId))
    } catch (err) {
      setFeedError(err.message)
    }
  }

  return (
    <div className="feed">
      <div className="feed-container">
        <Stories />

        <button className="open-create-modal-btn" onClick={() => setIsCreateModalOpen(true)}>
          + Create
        </button>

        {isCreateModalOpen && (
          <div className="create-post-modal-overlay" onClick={() => setIsCreateModalOpen(false)}>
            <div className="create-post-modal" onClick={(e) => e.stopPropagation()}>
              <div className="create-post-modal-header">
                <h3>Create Post</h3>
                <button onClick={() => setIsCreateModalOpen(false)}>✕</button>
              </div>

              <form className="create-post-form" onSubmit={handleCreatePost}>
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Write a caption"
                  rows={3}
                />
                <input
                  type="text"
                  value={imagesInput}
                  onChange={(e) => setImagesInput(e.target.value)}
                  placeholder="Image URLs (comma-separated)"
                />

                <label className="file-upload-label">
                  Upload image files
                  <input type="file" accept="image/*" multiple onChange={handleFileUpload} />
                </label>

                <small className="upload-hint">
                  {uploadingFiles
                    ? 'Uploading files to Cloudinary...'
                    : `${mergedImageCount} / 10 images selected`}
                </small>

                {selectedFiles.length > 0 && (
                  <small className="upload-hint">Files: {selectedFiles.map(file => file.name).join(', ')}</small>
                )}

                <button type="submit" disabled={posting || uploadingFiles}>
                  {posting ? (
                    <span className="posting-state">
                      <span className="button-spinner" /> Posting...
                    </span>
                  ) : 'Post'}
                </button>
              </form>
            </div>
          </div>
        )}

        {feedError && <p className="feed-error">{feedError}</p>}

        {isLoading && <div className="post-skeleton" />}

        {!isLoading && posts.length === 0 && (
          <div className="feed-empty">
            <p>No posts yet. Create your first post above.</p>
          </div>
        )}
        
        {/* 
          THEORY: Array Rendering with .map()
          =====================================
          .map() transforms array of posts into array of JSX elements.
          Key prop is essential for React's list reconciliation algorithm.
          Without it, React can't properly track which items have changed.
        */}
        {!isLoading && posts.map(post => (
          <Post
            key={post.id}
            post={post}
            onLike={handleLike}
            onComment={handleComment}
            onEdit={handleEditPost}
            onDelete={handleDeletePost}
            isLikePending={pendingLikePostIds.includes(post.id)}
            canManage={currentUser?.id && post.authorId === currentUser.id}
            currentUserId={currentUser?.id}
            onEditComment={handleEditComment}
            onDeleteComment={handleDeleteComment}
          />
        ))}
      </div>
    </div>
  )
}
