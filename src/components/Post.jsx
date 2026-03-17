import { useState } from 'react'
import '../styles/Post.css'

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
  onLike,
  onComment,
  onEdit,
  onDelete,
  canManage = false,
  currentUserId,
  onEditComment,
  onDeleteComment
}) {
  const [commentText, setCommentText] = useState('')
  const [showComments, setShowComments] = useState(false)

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

  const handlePostComment = () => {
    if (commentText.trim()) {
      onComment(post.id, {
        user: 'You',
        text: commentText
      })
      setCommentText('')
    }
  }

  return (
    <div className="post">
      {/* Header with author info */}
      <div className="post-header">
        <div className="author-info">
          <div className="avatar">
            {post.avatar ? (
              <img src={post.avatar} alt={post.author} className="post-avatar-image" />
            ) : (
              <span>👤</span>
            )}
          </div>
          <div className="author-details">
            <h3 className="author-name">{post.author}</h3>
            <p className="location">{post.location}</p>
          </div>
        </div>
        <button className="menu-btn">⋯</button>
        {canManage && (
          <div className="post-owner-actions">
            <button className="post-owner-btn" onClick={() => onEdit(post.id)}>Edit</button>
            <button className="post-owner-btn danger" onClick={() => onDelete(post.id)}>Delete</button>
          </div>
        )}
      </div>

      {/* Post image */}
      <div className="post-image">
        <img src={post.image} alt={post.caption} />
      </div>

      {/* Post actions */}
      <div className="post-actions">
        <button 
          className={`like-btn ${post.liked ? 'liked' : ''}`}
          onClick={() => onLike(post.id)}
          title={post.liked ? 'Unlike' : 'Like'}
        >
          {post.liked ? '❤️' : '🤍'}
        </button>
        <button className="comment-btn">💬</button>
        <button className="share-btn">📤</button>
        <button className="save-btn">🔖</button>
      </div>

      {/* Likes count */}
      <div className="likes-count">
        <strong>{post.likes} likes</strong>
      </div>

      {/* Caption */}
      <div className="post-caption">
        <p>
          <strong>{post.author}</strong> {post.caption}
        </p>
      </div>

      {/* Comments section */}
      <div className="comments-section">
        <button 
          className="view-comments-btn"
          onClick={() => setShowComments(!showComments)}
        >
          {showComments ? 'Hide' : 'View'} all {post.comments.length} comments
        </button>

        {showComments && (
          <div className="comments-list">
            {post.comments.map((comment, index) => (
              <div key={comment.id || index} className="comment">
                <strong>{comment.user}</strong>
                <p>{comment.text}</p>
                {(canManage || comment.userId === currentUserId) && (
                  <span className="comment-actions">
                    <button onClick={() => onEditComment(comment.id, post.id, comment.text)}>Edit</button>
                    <button onClick={() => onDeleteComment(comment.id, post.id)}>Delete</button>
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Comment input - Controlled Component */}
      <div className="comment-input">
        <input
          type="text"
          placeholder="Add a comment..."
          value={commentText}
          onChange={handleCommentChange}
          onKeyPress={(e) => {
            if (e.key === 'Enter') {
              handlePostComment()
            }
          }}
        />
        <button 
          onClick={handlePostComment}
          disabled={!commentText.trim()}
        >
          Post
        </button>
      </div>

      {/* Timestamp */}
      <div className="timestamp">
        <small>{post.timestamp}</small>
      </div>
    </div>
  )
}
