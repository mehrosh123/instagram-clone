import { useState } from 'react'

/**
 * THEORY: Post Component
 * ======================
 * Individual post component that displays a single Instagram-like post.
 * Demonstrates lifting state, event handling, and controlled components.
 * 
 * Component Props:
 * - post: Post object containing all post data
 * - onLike: Callback function passed from parent (Feed)
 * - onComment: Callback function for adding comments
 */

export default function Post({
  post,
  onOpenProfile,
  onLike,
  onComment,
  onEdit,
  onDelete,
  canManage = false,
  isLikePending = false,
  currentUserId,
  onEditComment,
  onDeleteComment,
  onCommentLike
}) {
  const isValidImageSource = (value) => {
    if (typeof value !== 'string') return false
    const src = value.trim()
    if (!src) return false

    if (src.startsWith('http://') || src.startsWith('https://')) {
      try {
        const parsed = new URL(src)
        return parsed.protocol === 'http:' || parsed.protocol === 'https:'
      } catch {
        return false
      }
    }

    if (src.startsWith('data:image/')) {
      const marker = ';base64,'
      const markerIndex = src.indexOf(marker)
      return markerIndex > 0 && markerIndex + marker.length < src.length
    }

    return src.startsWith('blob:')
  }

  const [commentText, setCommentText] = useState('')
  const [showComments, setShowComments] = useState(false)
  const [isPostingComment, setIsPostingComment] = useState(false)
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const postImages = Array.isArray(post?.images) && post.images.length > 0
    ? post.images.filter(isValidImageSource).slice(0, 10)
    : [post?.image].filter(isValidImageSource)
  const safeImages = postImages.length > 0 ? postImages : ['https://images.unsplash.com/photo-1503899036084-c55cdd92da26?w=1000&auto=format&fit=crop']
  const safeComments = Array.isArray(post?.comments) ? post.comments : []
  const safeLikedByUsers = Array.isArray(post?.likedByUsers) ? post.likedByUsers : []
  const activeImageIndex = currentImageIndex >= safeImages.length ? 0 : currentImageIndex

  /**
   * THEORY: Controlled Components
   * ============================
   * The input field is "controlled" by React state.
   * This gives React full control over the input value.
   * Pattern: value={state} + onChange handler
   */
  const handleCommentChange = (e) => {
    setCommentText(e.target.value)
  }

  const handlePostComment = async () => {
    const nextComment = commentText.trim()
    if (!nextComment || isPostingComment) return

    setIsPostingComment(true)
    const submitted = await onComment?.(post.id, {
      user: 'You',
      text: nextComment
    })

    if (submitted) {
      setCommentText('')
      setShowComments(true)
    }

    setIsPostingComment(false)
  }

  const goToPrevImage = () => {
    setCurrentImageIndex(activeImageIndex === 0 ? safeImages.length - 1 : activeImageIndex - 1)
  }

  const goToNextImage = () => {
    setCurrentImageIndex(activeImageIndex === safeImages.length - 1 ? 0 : activeImageIndex + 1)
  }

  if (!post) return null

  return (
    <article className="bg-white border border-gray-200 rounded-lg overflow-hidden mb-5">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden shrink-0 text-lg">
            {post.avatar ? (
              <img src={post.avatar} alt={post.author} className="w-full h-full object-cover" />
            ) : (
              <span>👤</span>
            )}
          </div>
          <div className="flex flex-col min-w-0">
            <button
              type="button"
              className="text-sm font-semibold text-left truncate hover:underline"
              onClick={() => onOpenProfile?.(post.username)}
            >
              {post.author}
            </button>
            <p className="text-xs text-gray-500">{post.location}</p>
          </div>
        </div>
        <button className="text-xl text-gray-500 px-2">⋯</button>
        {canManage && (
          <div className="flex gap-2 ml-2">
            <button className="text-xs border border-gray-300 rounded px-2 py-1" onClick={() => onEdit(post.id)}>Edit</button>
            <button className="text-xs border border-red-300 text-red-600 rounded px-2 py-1" onClick={() => onDelete(post.id)}>Delete</button>
          </div>
        )}
      </div>

      <div className="relative bg-black">
        <img
          src={safeImages[activeImageIndex]}
          alt={`${post.caption || 'Post image'} ${activeImageIndex + 1}`}
          className="w-full h-auto aspect-square object-cover"
        />

        {safeImages.length > 1 && (
          <>
            <button
              type="button"
              aria-label="Previous image"
              className="absolute left-3 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-black/45 text-white text-lg leading-none flex items-center justify-center"
              onClick={goToPrevImage}
            >
              &#8249;
            </button>

            <button
              type="button"
              aria-label="Next image"
              className="absolute right-3 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-black/45 text-white text-lg leading-none flex items-center justify-center"
              onClick={goToNextImage}
            >
              &#8250;
            </button>

            <div className="absolute top-3 right-3 bg-black/55 text-white text-xs rounded-full px-2 py-1">
              {activeImageIndex + 1}/{safeImages.length}
            </div>

            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5">
              {safeImages.map((_, index) => (
                <button
                  key={`${post.id}-dot-${index}`}
                  type="button"
                  aria-label={`Go to image ${index + 1}`}
                  className={index === activeImageIndex
                    ? 'h-2 w-2 rounded-full bg-blue-400'
                    : 'h-2 w-2 rounded-full bg-white/65'}
                  onClick={() => setCurrentImageIndex(index)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
        <button 
          className="text-2xl"
          onClick={() => onLike(post.id)}
          title={post.liked ? 'Unlike' : 'Like'}
          disabled={isLikePending}
        >
          {post.liked ? '❤️' : '🤍'}
        </button>
        <button className="text-2xl">💬</button>
        <button className="text-2xl">📤</button>
        <button className="text-2xl ml-auto">🔖</button>
      </div>

      <div className="px-4 pt-2 text-sm font-semibold">
        <strong>{post.likes} likes</strong>
        {safeLikedByUsers.length > 0 && (
          <p className="text-xs text-gray-600 font-normal mt-1">Liked by {safeLikedByUsers.slice(0, 3).join(', ')}</p>
        )}
      </div>

      <div className="px-4 mt-2 text-sm">
        <p className="leading-relaxed">
          <strong>{post.author}</strong> {post.caption}
        </p>
      </div>

      <div className="px-4 py-3">
        <button 
          className="text-xs text-gray-500 mb-2 hover:text-gray-700"
          onClick={() => setShowComments(!showComments)}
        >
          {showComments ? 'Hide' : 'View'} all {post.commentsCount ?? safeComments.length} comments
        </button>

        {showComments && (
          <div className="space-y-2">
            {safeComments.map((comment, index) => {
              const canEditComment = comment.userId === currentUserId
              const canDeleteComment = canManage || comment.userId === currentUserId

              return (
                <div key={comment.id || index} className="text-sm leading-5">
                  <button
                    type="button"
                    className="font-semibold mr-1 hover:underline"
                    onClick={() => onOpenProfile?.(comment.user)}
                  >
                    {comment.user}
                  </button>
                  <p className="inline">{comment.text}</p>
                  <span className="inline-flex gap-2 items-center ml-2">
                    <button
                      type="button"
                      className="text-xs text-blue-500 border border-gray-200 rounded px-2 py-0.5"
                      onClick={() => onCommentLike?.(post.id, comment.id, !!comment.liked)}
                    >
                      {comment.liked ? 'Unlike' : 'Like'}
                    </button>
                    <small className="text-xs text-gray-500">{comment.likes || 0} likes</small>
                    {comment.likedByUsers?.length > 0 && (
                      <small className="text-xs text-gray-500">by {comment.likedByUsers.slice(0, 2).join(', ')}</small>
                    )}
                  </span>
                  {(canEditComment || canDeleteComment) && (
                    <span className="inline-flex gap-2 ml-2">
                      {canEditComment && (
                        <button
                          className="text-xs text-gray-500 border border-gray-200 rounded px-2 py-0.5"
                          onClick={() => onEditComment?.(comment.id, post.id, comment.text)}
                        >
                          Edit
                        </button>
                      )}
                      {canDeleteComment && (
                        <button
                          className="text-xs text-red-500 border border-red-200 rounded px-2 py-0.5"
                          onClick={() => onDeleteComment?.(comment.id, post.id)}
                        >
                          Delete
                        </button>
                      )}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="flex gap-2 px-4 py-3 border-t border-gray-100">
        <input
          type="text"
          placeholder="Add a comment..."
          value={commentText}
          onChange={handleCommentChange}
          className="flex-1 border-none bg-transparent text-sm outline-none"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              handlePostComment()
            }
          }}
        />
        <button 
          className="text-blue-600 font-semibold text-sm disabled:opacity-30"
          onClick={handlePostComment}
          disabled={!commentText.trim() || isPostingComment}
        >
          {isPostingComment ? 'Posting...' : 'Post'}
        </button>
      </div>

      <div className="px-4 pb-3 text-xs text-gray-500">
        <small>{post.timestamp}</small>
      </div>
    </article>
  )
}
