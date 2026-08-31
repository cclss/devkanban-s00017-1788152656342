import { useCallback, useRef, useState } from 'react'
import type { DragEvent } from 'react'
import type { SourceFile } from '../core/types'
import type { RejectedFile } from '../state/useSourceFiles'
import { strings } from '../strings'
import InfoTooltip from './InfoTooltip'

/**
 * PDF loading surface. Accepts files by drag-and-drop or the
 * file picker, stays available after the first load so more files can be added
 * mid-session, lists what is loaded (name + page count), and surfaces rejected
 * files as inline messages.
 *
 * Presentational + interaction only — every load judgment is delegated upward
 * to the state layer (core), keeping this component free of PDF logic.
 */
export interface DropzoneProps {
  sourceFiles: SourceFile[]
  rejected: RejectedFile[]
  isLoading: boolean
  onAddFiles: (files: File[]) => void
  onDismissRejected: () => void
}

export default function Dropzone({
  sourceFiles,
  rejected,
  isLoading,
  onAddFiles,
  onDismissRejected,
}: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  // Nested dragenter/leave events fire per child; count to know when the
  // pointer has truly left the drop area.
  const dragDepth = useRef(0)

  const hasFiles = sourceFiles.length > 0

  const openPicker = useCallback(() => inputRef.current?.click(), [])

  const handleInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? [])
      if (files.length > 0) onAddFiles(files)
      // Reset so selecting the same file again still fires a change event.
      event.target.value = ''
    },
    [onAddFiles],
  )

  const handleDragEnter = useCallback((event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    dragDepth.current += 1
    setIsDragging(true)
  }, [])

  const handleDragOver = useCallback((event: DragEvent<HTMLElement>) => {
    // Required so the element is treated as a valid drop target.
    event.preventDefault()
  }, [])

  const handleDragLeave = useCallback((event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setIsDragging(false)
  }, [])

  const handleDrop = useCallback(
    (event: DragEvent<HTMLElement>) => {
      event.preventDefault()
      dragDepth.current = 0
      setIsDragging(false)
      const files = Array.from(event.dataTransfer.files ?? [])
      if (files.length > 0) onAddFiles(files)
    },
    [onAddFiles],
  )

  const dropClasses = [
    'dropzone',
    hasFiles ? 'dropzone--compact' : '',
    isDragging ? 'dropzone--active' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <>
      <section
        className={dropClasses}
        aria-label={strings.dropzone.regionLabel}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="dropzone__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 15V3" />
            <path d="m7 8 5-5 5 5" />
            <path d="M20 15v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-4" />
          </svg>
        </div>
        <h2 className="dropzone__title">
          {hasFiles ? strings.dropzone.dropMoreTitle : strings.dropzone.dropTitle}
        </h2>
        <p className="dropzone__desc">{strings.dropzone.description}</p>
        <button
          type="button"
          className="btn btn--primary"
          onClick={openPicker}
          disabled={isLoading}
        >
          {isLoading
            ? strings.dropzone.loading
            : hasFiles
              ? strings.dropzone.addFiles
              : strings.dropzone.chooseFiles}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          multiple
          className="dropzone__input"
          onChange={handleInputChange}
          aria-hidden="true"
          tabIndex={-1}
        />
        <p className="dropzone__note">
          {strings.dropzone.privacyNote}
          {/* Feature help for the whole load surface (spec §Dropzone): drag-or-
              pick, multi-file append order, local-only processing. Last sibling
              of the notice so it reads as a trailing "more info" affordance. */}
          <InfoTooltip helpKey="dropzone" />
        </p>
      </section>

      {rejected.length > 0 && (
        <div className="load-errors" role="alert">
          <div className="load-errors__head">
            <span className="load-errors__title">
              {strings.dropzone.rejectedTitle(rejected.length)}
            </span>
            <button
              type="button"
              className="load-errors__dismiss"
              onClick={onDismissRejected}
            >
              {strings.dropzone.dismiss}
            </button>
          </div>
          <ul className="load-errors__list">
            {rejected.map((file, index) => (
              <li key={`${file.name}-${index}`} className="load-errors__item">
                <span className="load-errors__name">{file.name}</span>
                <span className="load-errors__message">{file.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {hasFiles && (
        <section className="source-list" aria-label={strings.dropzone.sourceListLabel}>
          <h3 className="source-list__title">
            {strings.dropzone.sourceListTitle(sourceFiles.length)}
          </h3>
          <ul className="source-list__items">
            {sourceFiles.map((file) => (
              <li key={file.id} className="source-list__item">
                <span className="source-list__icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <path d="M14 2v6h6" />
                  </svg>
                </span>
                <span className="source-list__name">{file.name}</span>
                <span className="source-list__pages">
                  {strings.dropzone.pageCount(file.pageCount)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}
