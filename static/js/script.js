document.addEventListener("DOMContentLoaded", function () {
  // --- Configuration ---
  const MAX_WIDTH = 640;
  const MAX_HEIGHT = 480;
  const handleSize = 8;
  const minBoxSize = 5;

  // --- Global State for Multiple Images ---
  let imageData = []; // Array to hold data for all images { src, filename, originalWidth, originalHeight, scaleRatio, boxes }
  let currentImageIndex = -1; // Index of the currently displayed image
  let image = null; // The actual Image object currently being displayed

  // State related to the *current* image (will be updated on image switch)
  let scaleRatio = 1;
  let originalWidth = 0;
  let originalHeight = 0;
  let currentFilename = "annotated_image";
  let boxes = []; // Holds annotations for the CURRENT image (reference to imageData[currentImageIndex].boxes)

  // Global labels (shared across images)
  let labels = []; // { name: string, color: string }

  // Interaction State
  let currentTool = "draw"; // 'draw' or 'edit'
  let isDrawing = false;
  let isResizing = false;
  let selectedBoxIndex = -1; // Index within the *current* 'boxes' array
  let grabbedHandle = null;
  let startX = 0;
  let startY = 0;
  let isPredicting = false; // State for AI Assist

  // Canvas setup
  const canvas = document.getElementById("image-canvas");
  const ctx = canvas.getContext("2d");

  // DOM elements
  const uploadBtn = document.getElementById("upload-btn");
  const imageUpload = document.getElementById("image-upload");
  const saveBtn = document.getElementById("save-btn"); // Renamed for clarity (Export JSON)
  const exportYoloBtn = document.getElementById("export-yolo-btn");
  const drawBoxBtn = document.getElementById("draw-box-btn");
  const editBoxBtn = document.getElementById("edit-box-btn");
  const addLabelBtn = document.getElementById("add-label-btn");
  const newLabelInput = document.getElementById("new-label");
  const labelsList = document.getElementById("labels-list");
  const annotationsList = document.getElementById("annotations-list");
  const prevImageBtn = document.getElementById("prev-image-btn");
  const nextImageBtn = document.getElementById("next-image-btn");
  const imageInfoSpan = document.getElementById("image-info");
  const deleteImageBtn = document.getElementById("delete-image-btn");
  const aiAssistBtn = document.getElementById("ai-assist-btn"); // AI Assist button

  // --- Event Listeners ---
  drawBoxBtn.addEventListener("click", () => switchTool("draw"));
  editBoxBtn.addEventListener("click", () => switchTool("edit"));
  uploadBtn.addEventListener("click", () => {
    imageUpload.click();
  });
  prevImageBtn.addEventListener("click", () => {
    if (currentImageIndex > 0 && !isPredicting) {
      loadImageData(currentImageIndex - 1);
    }
  });
  nextImageBtn.addEventListener("click", () => {
    if (currentImageIndex < imageData.length - 1 && !isPredicting) {
      loadImageData(currentImageIndex + 1);
    }
  });
  addLabelBtn.addEventListener("click", addNewLabel);
  newLabelInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      addNewLabel();
    }
  });
  saveBtn.addEventListener("click", saveJsonAnnotations); // Export JSON
  exportYoloBtn.addEventListener("click", exportYoloAnnotations);
  deleteImageBtn.addEventListener("click", deleteCurrentImage);
  aiAssistBtn.addEventListener("click", handleAIAssist); // AI Assist listener

  // --- Keyboard Shortcut Listener ---
  document.addEventListener("keydown", handleKeyDown);

  // --- Tool Switching and State Reset ---
  function switchTool(tool) {
    currentTool = tool;
    if (tool === "draw") {
      drawBoxBtn.classList.add("active");
      editBoxBtn.classList.remove("active");
      canvas.style.cursor = "crosshair";
      resetEditState();
    } else {
      // 'edit'
      editBoxBtn.classList.add("active");
      drawBoxBtn.classList.remove("active");
      canvas.style.cursor = "default";
      resetDrawState();
    }
    redrawCanvas(); // Redraw to show/hide handles
  }

  function resetDrawState() {
    isDrawing = false;
  }

  function resetEditState() {
    isResizing = false;
    selectedBoxIndex = -1;
    grabbedHandle = null;
  }

  // --- Image Upload Handling ---
  imageUpload.addEventListener("change", (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Clear existing data before loading new images
    imageData = [];
    currentImageIndex = -1;
    clearCanvasAndState(); // Clear canvas, reset states, update UI

    const filePromises = [];
    let loadErrors = 0;

    Array.from(files).forEach((file) => {
      if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        const loadPromise = new Promise((resolve, reject) => {
          reader.onload = function (event) {
            const img = new Image();
            img.onload = function () {
              let currentScaleRatio = 1;
              const currentOriginalWidth = img.width;
              const currentOriginalHeight = img.height;

              if (
                currentOriginalWidth > MAX_WIDTH ||
                currentOriginalHeight > MAX_HEIGHT
              ) {
                const widthRatio = MAX_WIDTH / currentOriginalWidth;
                const heightRatio = MAX_HEIGHT / currentOriginalHeight;
                currentScaleRatio = Math.min(widthRatio, heightRatio);
              }

              const data = {
                src: event.target.result, // Base64 data URL
                filename: file.name,
                originalWidth: currentOriginalWidth,
                originalHeight: currentOriginalHeight,
                scaleRatio: currentScaleRatio,
                boxes: [], // Initialize empty boxes for this image
              };
              imageData.push(data);
              resolve(); // Resolve promise for this file
            };
            img.onerror = (err) => {
              console.error(
                "Error loading image into Image object:",
                file.name,
                err,
              );
              loadErrors++;
              reject(new Error(`Failed to load image: ${file.name}`)); // Reject promise
            };
            img.src = event.target.result; // Start loading image object
          };
          reader.onerror = (err) => {
            console.error("Error reading file:", file.name, err);
            loadErrors++;
            reject(new Error(`Failed to read file: ${file.name}`)); // Reject promise
          };
          reader.readAsDataURL(file); // Start reading file
        });
        filePromises.push(loadPromise);
      } else {
        console.warn("Skipping non-image file:", file.name);
      }
    });

    // Wait for all file processing promises
    Promise.allSettled(filePromises) // Use allSettled to continue even if some fail
      .then((results) => {
        const successfulLoads = results.filter(
          (r) => r.status === "fulfilled",
        ).length;
        console.log(
          `Processed ${files.length} files. Successfully loaded ${successfulLoads} images.`,
        );

        if (imageData.length > 0) {
          loadImageData(0); // Load the first successfully processed image
        } else {
          updateNavigationUI(); // Update UI if no images loaded
          if (loadErrors > 0) {
            alert(
              `Failed to load ${loadErrors} image(s). Please check console for details.`,
            );
          }
        }
        // Reset file input value to allow re-uploading the same file(s)
        imageUpload.value = null;
      })
      .catch((error) => {
        // This catch is less likely with Promise.allSettled, but good practice
        console.error("Unexpected error during file processing:", error);
        alert(
          "An unexpected error occurred while loading images. Please check the console.",
        );
        updateNavigationUI();
        imageUpload.value = null;
      });
  });

  // --- Image Loading and Navigation ---
  function loadImageData(index) {
    if (index < 0 || index >= imageData.length) {
      console.error("Invalid image index requested:", index);
      // Optionally clear canvas or show placeholder
      clearCanvasAndState(); // Best to clear if index is invalid
      return;
    }

    // Save annotations for the *previous* image before switching (if any)
    // This step is implicitly handled because `boxes` references `imageData[currentImageIndex].boxes`.
    // When we switch `currentImageIndex`, the `boxes` reference will be updated.

    currentImageIndex = index;
    const data = imageData[currentImageIndex];

    // Update global state from the selected image's data
    originalWidth = data.originalWidth;
    originalHeight = data.originalHeight;
    scaleRatio = data.scaleRatio;
    currentFilename = data.filename;
    boxes = data.boxes; // CRITICAL: Update the 'boxes' reference

    console.log(
      `Loading image ${currentImageIndex + 1}/${imageData.length}: ${currentFilename} (Original: ${originalWidth}x${originalHeight}, Scale: ${scaleRatio.toFixed(3)})`,
    );

    image = new Image();
    image.onload = () => {
      const displayWidth = Math.round(originalWidth * scaleRatio);
      const displayHeight = Math.round(originalHeight * scaleRatio);

      // Check if canvas dimensions actually need changing
      if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
        canvas.width = displayWidth;
        canvas.height = displayHeight;
        console.log(`Canvas resized to: ${displayWidth}x${displayHeight}`);
      }

      resetDrawState();
      resetEditState();
      switchTool(currentTool); // Re-apply current tool cursor etc.
      redrawCanvas();
      updateAnnotationsList(); // Update sidebar list for the new image
      updateNavigationUI(); // Update buttons and image info text
    };
    image.onerror = () => {
      console.error("Error loading image source for display:", data.filename);
      alert(
        `Error loading image: ${data.filename}. It might be corrupted or unsupported.`,
      );
      // Consider removing the problematic image data or marking it as bad
      imageData.splice(currentImageIndex, 1);
      // Try loading the next image or clear if it was the last one
      if (imageData.length > 0) {
        loadImageData(Math.max(0, currentImageIndex)); // Load image at current index (now points to next) or 0
      } else {
        clearCanvasAndState();
      }
    };
    image.src = data.src; // Start loading the image from its base64 source
  }

  function clearCanvasAndState() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    image = null;
    boxes = []; // Clear the reference
    originalWidth = 0;
    originalHeight = 0;
    scaleRatio = 1;
    currentFilename = "annotated_image";
    currentImageIndex = -1; // Indicate no image is loaded
    resetDrawState();
    resetEditState();
    updateAnnotationsList(); // Clear the sidebar list
    updateNavigationUI(); // Update buttons and info text
    console.log("Canvas and state cleared.");
  }

  function updateNavigationUI() {
    const hasImages = imageData.length > 0;
    const hasCurrentIndex =
      currentImageIndex >= 0 && currentImageIndex < imageData.length;

    // Enable/disable delete button
    deleteImageBtn.disabled = !hasCurrentIndex || isPredicting;
    // Enable/disable AI Assist button
    aiAssistBtn.disabled = !hasCurrentIndex || isPredicting;

    if (!hasImages) {
      imageInfoSpan.textContent = "No images loaded";
      prevImageBtn.disabled = true;
      nextImageBtn.disabled = true;
    } else {
      if (hasCurrentIndex) {
        // Use ellipsis for long filenames if needed (CSS should handle this too)
        const displayFilename =
          imageData[currentImageIndex].filename.length > 25
            ? imageData[currentImageIndex].filename.substring(0, 22) + "..."
            : imageData[currentImageIndex].filename;
        imageInfoSpan.textContent = `${currentImageIndex + 1} / ${imageData.length} (${displayFilename})`;
      } else {
        imageInfoSpan.textContent = `0 / ${imageData.length}`; // Show 0 if index is invalid but images exist
      }
      // Enable/disable navigation buttons based on index and prediction state
      prevImageBtn.disabled = currentImageIndex <= 0 || isPredicting;
      nextImageBtn.disabled =
        currentImageIndex >= imageData.length - 1 || isPredicting;
    }

    // Update AI Assist button text if predicting
    if (isPredicting) {
      aiAssistBtn.textContent = "Predicting...";
    } else {
      aiAssistBtn.textContent = "AI Assist";
    }
  }

  // --- Canvas Event Handlers ---
  canvas.addEventListener("mousedown", handleMouseDown);
  canvas.addEventListener("mousemove", handleMouseMove);
  canvas.addEventListener("mouseup", handleMouseUp);
  canvas.addEventListener("mouseleave", handleMouseLeave); // Important for cleanup

  function getMousePos(e) {
    const rect = canvas.getBoundingClientRect();
    // Clamp coordinates to stay within canvas boundaries
    const x = Math.max(0, Math.min(e.clientX - rect.left, canvas.width));
    const y = Math.max(0, Math.min(e.clientY - rect.top, canvas.height));
    return { x, y };
  }

  // Check if mouse is over a resize handle
  function getHandleUnderMouse(x, y) {
    // Iterate backwards to prioritize handles of boxes drawn last (on top)
    for (let i = boxes.length - 1; i >= 0; i--) {
      const box = boxes[i];
      const hs = handleSize / 2; // Half handle size for center calculation

      // Calculate handle positions
      const tl_x = box.x;
      const tl_y = box.y;
      const tr_x = box.x + box.width;
      const tr_y = box.y;
      const bl_x = box.x;
      const bl_y = box.y + box.height;
      const br_x = box.x + box.width;
      const br_y = box.y + box.height;

      // Check Top-Left handle
      if (x >= tl_x - hs && x <= tl_x + hs && y >= tl_y - hs && y <= tl_y + hs)
        return { boxIndex: i, handle: "tl" };
      // Check Top-Right handle
      if (x >= tr_x - hs && x <= tr_x + hs && y >= tr_y - hs && y <= tr_y + hs)
        return { boxIndex: i, handle: "tr" };
      // Check Bottom-Left handle
      if (x >= bl_x - hs && x <= bl_x + hs && y >= bl_y - hs && y <= bl_y + hs)
        return { boxIndex: i, handle: "bl" };
      // Check Bottom-Right handle
      if (x >= br_x - hs && x <= br_x + hs && y >= br_y - hs && y <= br_y + hs)
        return { boxIndex: i, handle: "br" };
    }
    return null; // No handle found
  }

  function handleMouseDown(e) {
    if (!image || isPredicting) return; // Don't interact if no image or predicting
    const pos = getMousePos(e);
    startX = pos.x;
    startY = pos.y;

    if (currentTool === "draw") {
      isDrawing = true;
      resetEditState(); // Ensure no box is selected for editing
    } else if (currentTool === "edit") {
      resetDrawState(); // Ensure not drawing
      const handleInfo = getHandleUnderMouse(pos.x, pos.y);
      if (handleInfo) {
        isResizing = true;
        selectedBoxIndex = handleInfo.boxIndex;
        grabbedHandle = handleInfo.handle;
        console.log(
          `Grabbed handle ${grabbedHandle} of box ${selectedBoxIndex}`,
        );
      } else {
        // If clicked outside any handle, potentially select a box for moving (future feature)
        // For now, just reset edit state if clicking empty space
        resetEditState();
        redrawCanvas(); // Redraw to remove any previous selection highlight if any
      }
    }
  }

  function handleMouseMove(e) {
    if (!image || isPredicting) return; // Ignore if no image or predicting
    const pos = getMousePos(e);
    const currentX = pos.x;
    const currentY = pos.y;

    if (currentTool === "draw" && isDrawing) {
      redrawCanvas(); // Redraw base image + existing boxes
      // Draw the temporary rectangle being drawn
      ctx.strokeStyle = "#61afef"; // Use accent color for drawing preview
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 3]); // Dashed line for preview
      ctx.strokeRect(startX, startY, currentX - startX, currentY - startY);
      ctx.setLineDash([]); // Reset line dash
    } else if (currentTool === "edit" && isResizing) {
      const box = boxes[selectedBoxIndex];
      if (!box) {
        // Safety check
        isResizing = false;
        return;
      }
      // Store original values before modification
      const originalBoxX = box.x;
      const originalBoxY = box.y;
      const originalBoxWidth = box.width;
      const originalBoxHeight = box.height;

      let newX = box.x,
        newY = box.y,
        newWidth = box.width,
        newHeight = box.height;

      switch (grabbedHandle) {
        case "tl": // Top-left handle drags top and left edges
          newWidth = originalBoxX + originalBoxWidth - currentX;
          newHeight = originalBoxY + originalBoxHeight - currentY;
          newX = currentX;
          newY = currentY;
          break;
        case "tr": // Top-right handle drags top and right edges
          newWidth = currentX - originalBoxX;
          newHeight = originalBoxY + originalBoxHeight - currentY;
          // newX = originalBoxX; // X doesn't change
          newY = currentY;
          break;
        case "bl": // Bottom-left handle drags bottom and left edges
          newWidth = originalBoxX + originalBoxWidth - currentX;
          newHeight = currentY - originalBoxY;
          newX = currentX;
          // newY = originalBoxY; // Y doesn't change
          break;
        case "br": // Bottom-right handle drags bottom and right edges
          newWidth = currentX - originalBoxX;
          newHeight = currentY - originalBoxY;
          // newX = originalBoxX; // X doesn't change
          // newY = originalBoxY; // Y doesn't change
          break;
      }

      // Apply changes (will be validated on mouseup)
      box.x = newX;
      box.y = newY;
      box.width = newWidth;
      box.height = newHeight;

      redrawCanvas(); // Redraw with the box being resized
    } else if (currentTool === "edit" && !isResizing) {
      // Update cursor style when hovering over handles
      const handleInfo = getHandleUnderMouse(currentX, currentY);
      if (handleInfo) {
        switch (handleInfo.handle) {
          case "tl":
          case "br":
            canvas.style.cursor = "nwse-resize";
            break;
          case "tr":
          case "bl":
            canvas.style.cursor = "nesw-resize";
            break;
          default:
            canvas.style.cursor = "default";
            break; // Should not happen
        }
      } else {
        canvas.style.cursor = "default"; // Default cursor when not over a handle
      }
    }
  }

  function handleMouseUp(e) {
    if (isPredicting) return; // Ignore if predicting

    if (currentTool === "draw" && isDrawing) {
      isDrawing = false;
      const pos = getMousePos(e);
      const endX = pos.x;
      const endY = pos.y;

      // Calculate final box dimensions relative to canvas
      const finalX = Math.min(startX, endX);
      const finalY = Math.min(startY, endY);
      const finalWidth = Math.abs(endX - startX);
      const finalHeight = Math.abs(endY - startY);

      if (
        finalWidth >= minBoxSize &&
        finalHeight >= minBoxSize &&
        currentImageIndex !== -1
      ) {
        const newBox = {
          x: finalX,
          y: finalY,
          width: finalWidth,
          height: finalHeight,
          // Assign first label by default, or 'unlabeled' if none exist
          label: labels.length > 0 ? labels[0].name : "unlabeled",
        };
        imageData[currentImageIndex].boxes.push(newBox);
        updateAnnotationsList(); // Update the sidebar
      } else {
        console.log("Box too small, not added.");
      }
      redrawCanvas(); // Redraw to show the final box (or clear the preview)
    } else if (currentTool === "edit" && isResizing) {
      const box = boxes[selectedBoxIndex];
      if (box) {
        // Normalize box dimensions: ensure width/height are positive
        // and x/y refer to top-left corner. Also enforce minimum size.
        if (box.width < 0) {
          box.x = box.x + box.width; // Adjust x
          box.width = Math.abs(box.width);
        }
        if (box.height < 0) {
          box.y = box.y + box.height; // Adjust y
          box.height = Math.abs(box.height);
        }
        // Enforce minimum size
        box.width = Math.max(minBoxSize, box.width);
        box.height = Math.max(minBoxSize, box.height);

        // Ensure box stays within canvas boundaries (optional but recommended)
        box.x = Math.max(0, box.x);
        box.y = Math.max(0, box.y);
        if (box.x + box.width > canvas.width) {
          box.width = canvas.width - box.x;
        }
        if (box.y + box.height > canvas.height) {
          box.height = canvas.height - box.y;
        }
        // Re-check min size after boundary adjustment
        box.width = Math.max(minBoxSize, box.width);
        box.height = Math.max(minBoxSize, box.height);
      }
      resetEditState(); // Done resizing
      redrawCanvas(); // Redraw with final position/size
      updateAnnotationsList(); // Update sidebar if label needs refresh
      canvas.style.cursor = "default"; // Reset cursor
    }
  }

  function handleMouseLeave(e) {
    // If drawing or resizing was in progress when mouse left canvas, finalize it
    if (isDrawing) {
      isDrawing = false;
      // Optionally finalize the box based on last known position (or just cancel)
      console.log("Drawing cancelled due to mouse leave.");
      redrawCanvas(); // Clear drawing preview
    }
    if (isResizing) {
      // Apply the same finalization logic as in handleMouseUp
      const box = boxes[selectedBoxIndex];
      if (box) {
        if (box.width < 0) {
          box.x += box.width;
          box.width = Math.abs(box.width);
        }
        if (box.height < 0) {
          box.y += box.height;
          box.height = Math.abs(box.height);
        }
        box.width = Math.max(minBoxSize, box.width);
        box.height = Math.max(minBoxSize, box.height);
        // Boundary check (optional)
        box.x = Math.max(0, box.x);
        box.y = Math.max(0, box.y);
        box.width = Math.min(box.width, canvas.width - box.x);
        box.height = Math.min(box.height, canvas.height - box.y);
        box.width = Math.max(minBoxSize, box.width);
        box.height = Math.max(minBoxSize, box.height);
      }
      console.log("Resizing finalized due to mouse leave.");
      resetEditState();
      redrawCanvas();
      updateAnnotationsList();
      canvas.style.cursor = "default"; // Reset cursor
    } else if (currentTool === "edit") {
      canvas.style.cursor = "default"; // Ensure cursor resets if just hovering
    }
  }

  // --- Drawing Canvas ---
  function redrawCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // --- Explicitly get current image data and boxes ---
    const currentImageData =
      currentImageIndex >= 0 ? imageData[currentImageIndex] : null;

    // Draw the image if available
    if (image && canvas.width > 0 && canvas.height > 0) {
      try {
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      } catch (e) {
        console.error("Error drawing image:", e);
        drawPlaceholder("Error drawing image");
        return; // Stop drawing further elements
      }
    } else {
      // Draw a placeholder if no image is loaded
      drawPlaceholder("Upload images to begin");
      return; // Stop drawing further elements (boxes)
    }

    // --- Use the fetched boxes ---
    const currentBoxes = currentImageData ? currentImageData.boxes : []; // Get boxes for current image, or empty if none

    if (!currentBoxes) {
      console.warn(
        "RedrawCanvas: No boxes array found for current image index:",
        currentImageIndex,
      );
      return; // Should not happen if currentImageData exists, but safety check
    }

    // Draw all bounding boxes for the current image
    currentBoxes.forEach((box, index) => {
      // Iterate over currentBoxes, not the global 'boxes'
      const labelObj = labels.find((l) => l.name === box.label);
      const color = labelObj ? labelObj.color : "#CCCCCC"; // Default grey for unknown labels
      const fontColor = getContrastYIQ(color); // Get good contrast for text

      // --- Add Robustness: Check for valid numbers before drawing ---
      if (
        isNaN(box.x) ||
        isNaN(box.y) ||
        isNaN(box.width) ||
        isNaN(box.height)
      ) {
        console.warn(
          `RedrawCanvas: Skipping box index ${index} due to invalid coordinates:`,
          box,
        );
        return; // Continue to the next box
      }
      // --- End Check ---

      // Draw the box rectangle
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(box.x, box.y, box.width, box.height);

      // Draw the label background and text
      if (box.label) {
        ctx.fillStyle = color;
        const text = box.label;
        ctx.font = "bold 12px Arial";
        const textMetrics = ctx.measureText(text);
        const textWidth = textMetrics.width;
        const textHeight = 16;
        const textPad = 5;

        let bgY = box.y - textHeight;
        if (bgY < 0) {
          bgY = box.y + 2;
        }

        ctx.fillRect(box.x, bgY, textWidth + textPad * 2, textHeight);

        ctx.fillStyle = fontColor;
        ctx.fillText(text, box.x + textPad, bgY + textHeight - 4);
      }

      // Draw resize handles if in edit mode
      if (currentTool === "edit") {
        // ... (handle drawing logic remains the same, using 'box') ...
        ctx.fillStyle = color;
        ctx.strokeStyle = "white";
        ctx.lineWidth = 1;
        const hs = handleSize / 2;
        ctx.fillRect(box.x - hs, box.y - hs, handleSize, handleSize); // TL
        ctx.strokeRect(box.x - hs, box.y - hs, handleSize, handleSize);
        ctx.fillRect(
          box.x + box.width - hs,
          box.y - hs,
          handleSize,
          handleSize,
        ); // TR
        ctx.strokeRect(
          box.x + box.width - hs,
          box.y - hs,
          handleSize,
          handleSize,
        );
        ctx.fillRect(
          box.x - hs,
          box.y + box.height - hs,
          handleSize,
          handleSize,
        ); // BL
        ctx.strokeRect(
          box.x - hs,
          box.y + box.height - hs,
          handleSize,
          handleSize,
        );
        ctx.fillRect(
          box.x + box.width - hs,
          box.y + box.height - hs,
          handleSize,
          handleSize,
        ); // BR
        ctx.strokeRect(
          box.x + box.width - hs,
          box.y + box.height - hs,
          handleSize,
          handleSize,
        );
      }
    });
  }

  // Helper to draw placeholder text on canvas
  function drawPlaceholder(text) {
    ctx.fillStyle = "#33373e"; // Darker background for placeholder
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#828a9a"; // Muted text color
    ctx.font = "16px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  }

  // --- Label Management ---
  function addNewLabel() {
    const labelName = newLabelInput.value.trim();
    if (!labelName) {
      alert("Please enter a label name.");
      return;
    }
    if (labels.some((l) => l.name.toLowerCase() === labelName.toLowerCase())) {
      alert(`Label "${labelName}" already exists (case-insensitive).`);
      return;
    }

    const color = getRandomColor();
    labels.push({ name: labelName, color: color });
    updateLabelsList(); // Update the labels sidebar section
    updateAnnotationsList(); // Update annotation dropdowns in case 'unlabeled' needs replacing
    newLabelInput.value = ""; // Clear input field
    newLabelInput.focus(); // Set focus back for quick adding

    // If this is the *first* label added, update existing 'unlabeled' boxes
    if (labels.length === 1 && currentImageIndex !== -1) {
      let changed = false;
      imageData[currentImageIndex].boxes.forEach((box) => {
        if (box.label === "unlabeled") {
          box.label = labelName;
          changed = true;
        }
      });
      if (changed) {
        redrawCanvas();
        updateAnnotationsList(); // Reflect label change in list
      }
    }
    console.log(`Added label: ${labelName} (${color})`);
  }

  function updateLabelsList() {
    labelsList.innerHTML = ""; // Clear existing list
    if (labels.length === 0) {
      labelsList.innerHTML =
        '<p style="color: var(--text-secondary); font-style: italic; padding: 5px;">No labels defined yet.</p>';
    } else {
      labels.forEach((label, index) => {
        const labelItem = document.createElement("div");
        labelItem.className = "label-item";
        // labelItem.style.cursor = "pointer"; // Maybe use later for setting default label

        const labelDisplay = document.createElement("div");
        labelDisplay.innerHTML = `<span class="label-color" style="background-color: ${label.color}"></span>${escapeHtml(label.name)}`; // Escape label name

        // Delete button for the label
        const deleteBtn = document.createElement("button");
        deleteBtn.className = "btn delete-label-btn";
        deleteBtn.textContent = "✕"; // Use '✕' symbol
        deleteBtn.title = `Delete label "${escapeHtml(label.name)}"`;
        deleteBtn.onclick = (e) => {
          e.stopPropagation(); // Prevent triggering labelItem click if added later
          deleteLabel(index);
        };

        labelItem.appendChild(labelDisplay);
        labelItem.appendChild(deleteBtn);
        labelsList.appendChild(labelItem);
      });
    }
  }

  function deleteLabel(indexToDelete) {
    const labelToDelete = labels[indexToDelete];
    if (!labelToDelete) return;

    const labelNameToDelete = labelToDelete.name;

    if (
      !confirm(
        `Are you sure you want to delete the label "${labelNameToDelete}"? \nThis will change annotations using this label to 'unlabeled' (or the first available label if 'unlabeled' is not suitable).`,
      )
    ) {
      return;
    }

    console.log(`Deleting label: ${labelNameToDelete}`);
    labels.splice(indexToDelete, 1); // Remove from the global list

    const fallbackLabel = labels.length > 0 ? labels[0].name : "unlabeled";

    // Update boxes across ALL images that used this label
    imageData.forEach((imgData, imgIndex) => {
      let changed = false;
      imgData.boxes.forEach((box) => {
        if (box.label === labelNameToDelete) {
          box.label = fallbackLabel;
          changed = true;
        }
      });
      // If changes occurred on the currently viewed image, trigger updates
      if (changed && imgIndex === currentImageIndex) {
        redrawCanvas();
        updateAnnotationsList();
      } else if (changed) {
        // If changed on a non-visible image, the data is updated,
        // it will be reflected when that image is loaded.
        console.log(`Updated labels in background image: ${imgData.filename}`);
      }
    });

    updateLabelsList(); // Refresh the label list itself
    // If the current image wasn't affected, we still might need to update
    // the annotations list if the deleted label was present there.
    if (
      currentImageIndex !== -1 &&
      !imageData[currentImageIndex].boxes.some(
        (b) =>
          b.label === fallbackLabel &&
          !labels.some((l) => l.name === fallbackLabel),
      )
    ) {
      updateAnnotationsList();
    }
  }

  // --- Annotation List Management ---
  function updateAnnotationsList() {
    annotationsList.innerHTML = ""; // Clear previous list

    if (
      currentImageIndex === -1 ||
      !imageData[currentImageIndex] ||
      imageData[currentImageIndex].boxes.length === 0
    ) {
      annotationsList.innerHTML =
        '<p style="color: var(--text-secondary); font-style: italic; padding: 5px;">No annotations for this image.</p>';
      boxes = []; // Ensure local 'boxes' is empty if no image/boxes
      return;
    }

    boxes = imageData[currentImageIndex].boxes; // Ensure 'boxes' points to the correct array

    boxes.forEach((box, index) => {
      const annotationItem = document.createElement("div");
      annotationItem.className = "annotation-item";

      // Create dropdown (select) for labels
      const labelSelect = document.createElement("select");
      labelSelect.className = "annotation-label-select";
      labelSelect.title = `Label for box ${index + 1}`;

      let currentLabelExists = labels.some((l) => l.name === box.label);

      // Add 'unlabeled' option if no labels exist OR if current box label is not in the list
      if (
        labels.length === 0 ||
        box.label === "unlabeled" ||
        !currentLabelExists
      ) {
        const option = document.createElement("option");
        option.value = "unlabeled";
        option.textContent = "unlabeled";
        // Select 'unlabeled' if it's the box's label or the label doesn't exist
        option.selected = box.label === "unlabeled" || !currentLabelExists;
        labelSelect.appendChild(option);
      }

      // Add options for all defined labels
      labels.forEach((label) => {
        const option = document.createElement("option");
        option.value = label.name;
        option.textContent = escapeHtml(label.name); // Escape label name
        if (box.label === label.name) {
          option.selected = true;
        }
        labelSelect.appendChild(option);
      });

      // Event listener for changing the label via dropdown
      labelSelect.onchange = (e) => {
        const newLabel = e.target.value;
        imageData[currentImageIndex].boxes[index].label = newLabel;
        console.log(`Box ${index} label changed to: ${newLabel}`);
        redrawCanvas(); // Update canvas to show new label color/text
        // No need to call updateAnnotationsList again unless colors changed etc.
      };

      // Create delete button for the annotation
      const deleteBtn = document.createElement("button");
      deleteBtn.className = "btn delete-annotation-btn";
      deleteBtn.textContent = "✕"; // Use '✕' symbol
      deleteBtn.title = `Delete annotation ${index + 1}`;
      deleteBtn.onclick = () => {
        deleteAnnotation(index);
      };

      annotationItem.appendChild(labelSelect);
      annotationItem.appendChild(deleteBtn);
      annotationsList.appendChild(annotationItem);
    });
  }

  function deleteAnnotation(indexToDelete) {
    if (currentImageIndex === -1 || !imageData[currentImageIndex]) return;

    // If currently resizing the box being deleted, reset state
    if (isResizing && selectedBoxIndex === indexToDelete) {
      resetEditState();
      canvas.style.cursor = currentTool === "edit" ? "default" : "crosshair"; // Reset cursor based on tool
    }

    imageData[currentImageIndex].boxes.splice(indexToDelete, 1);
    console.log(`Deleted annotation ${indexToDelete + 1}`);

    // Adjust selectedBoxIndex if it was affected by the deletion
    if (selectedBoxIndex > indexToDelete) {
      selectedBoxIndex--;
    } else if (selectedBoxIndex === indexToDelete) {
      resetEditState(); // The selected box is gone
    }

    updateAnnotationsList(); // Refresh the list
    redrawCanvas(); // Remove the box from the canvas
  }

  // --- AI Assist Functionality ---
  async function handleAIAssist() {
    if (
      currentImageIndex === -1 ||
      !imageData[currentImageIndex] ||
      isPredicting
    ) {
      console.log(
        "AI Assist cannot run: No image loaded or prediction in progress.",
      );
      return;
    }

    const currentImageData = imageData[currentImageIndex];
    console.log(`Requesting AI prediction for: ${currentImageData.filename}`);

    // --- UI updates: Indicate loading ---
    isPredicting = true;
    aiAssistBtn.disabled = true;
    aiAssistBtn.textContent = "Predicting...";
    // Disable other actions that might interfere
    uploadBtn.disabled = true;
    prevImageBtn.disabled = true;
    nextImageBtn.disabled = true;
    deleteImageBtn.disabled = true;
    drawBoxBtn.disabled = true; // Maybe allow switching tools? For now, disable.
    editBoxBtn.disabled = true;
    // Consider adding a loading overlay or spinner to the canvas
    canvas.style.opacity = "0.7";
    canvas.style.cursor = "wait";

    try {
      const response = await fetch("/ai_assist", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ image_data: currentImageData.src }), // Send base64 data URL
      });

      if (!response.ok) {
        // Try to get error message from response body
        let errorMsg = `HTTP error ${response.status}`;
        try {
          const errorData = await response.json();
          errorMsg = errorData.error || errorMsg;
        } catch (e) {
          /* Ignore if response body is not JSON */
        }
        throw new Error(errorMsg);
      }

      const result = await response.json();

      if (result.success && result.boxes) {
        console.log(
          "AI prediction successful. Received boxes:",
          result.boxes.length,
        );
        addPredictionsToCanvas(result.boxes);
      } else {
        throw new Error(
          result.error || "Prediction failed: No boxes found or backend error.",
        );
      }
    } catch (error) {
      console.error("AI Assist failed:", error);
      alert(`AI Assist Error: ${error.message}`);
    } finally {
      // --- UI updates: Restore state ---
      isPredicting = false;
      aiAssistBtn.disabled = false;
      aiAssistBtn.textContent = "AI Assist";
      uploadBtn.disabled = false;
      // Re-enable nav buttons based on current index
      prevImageBtn.disabled = currentImageIndex <= 0;
      nextImageBtn.disabled = currentImageIndex >= imageData.length - 1;
      deleteImageBtn.disabled = currentImageIndex < 0; // Re-enable if image exists
      drawBoxBtn.disabled = false;
      editBoxBtn.disabled = false;
      canvas.style.opacity = "1";
      canvas.style.cursor = currentTool === "draw" ? "crosshair" : "default"; // Restore cursor based on tool
      updateNavigationUI(); // Ensure all states are correct
    }
  }

  function addPredictionsToCanvas(predictions) {
    if (currentImageIndex === -1 || !imageData[currentImageIndex]) return;

    const currentImageData = imageData[currentImageIndex];
    const currentScaleRatio = currentImageData.scaleRatio;
    let boxesAdded = 0;

    predictions.forEach((pred) => {
      // Backend sends coordinates relative to ORIGINAL image size
      const originalX = pred.x_min;
      const originalY = pred.y_min;
      const originalWidth = pred.x_max - pred.x_min;
      const originalHeight = pred.y_max - pred.y_min;

      // Convert ORIGINAL coordinates to CANVAS coordinates
      const canvasX = Math.round(originalX * currentScaleRatio);
      const canvasY = Math.round(originalY * currentScaleRatio);
      const canvasWidth = Math.round(originalWidth * currentScaleRatio);
      const canvasHeight = Math.round(originalHeight * currentScaleRatio);

      // Basic validation for converted coordinates
      if (canvasWidth < minBoxSize || canvasHeight < minBoxSize) {
        console.warn(
          `Skipping predicted box for label '${pred.label}' - too small on canvas (${canvasWidth}x${canvasHeight})`,
        );
        return;
      }

      // Ensure the predicted label exists in our list, add if not?
      // For now, just use the label directly. If it doesn't exist, it gets default color.
      // User can add the label manually later if desired.
      if (!labels.some((l) => l.name === pred.label)) {
        console.log(
          `Predicted label "${pred.label}" not in user-defined labels. Using directly.`,
        );
        // Optionally: add the label automatically
        // const color = getRandomColor();
        // labels.push({ name: pred.label, color: color });
        // updateLabelsList(); // Update sidebar if adding automatically
      }

      const newBox = {
        x: canvasX,
        y: canvasY,
        width: canvasWidth,
        height: canvasHeight,
        label: pred.label,
        // Could also store confidence if needed: confidence: pred.confidence
      };

      currentImageData.boxes.push(newBox);
      boxesAdded++;
    });

    if (boxesAdded > 0) {
      console.log(`Added ${boxesAdded} predicted boxes to the canvas.`);
      redrawCanvas();
      updateAnnotationsList();
      // Optional: Provide feedback to the user
      // alert(`${boxesAdded} boxes added by AI Assist.`);
    } else {
      console.log("No valid boxes were added from the prediction results.");
      // Optional: Provide feedback
      // alert("AI Assist finished, but no new boxes met the criteria to be added.");
    }
  }

  // --- Utilities ---
  function getRandomColor() {
    // Generate visually distinct colors (more complex than pure random)
    // Simple version:
    const letters = "0123456789ABCDEF";
    let color = "#";
    for (let i = 0; i < 6; i++) {
      color += letters[Math.floor(Math.random() * 16)];
    }
    // Avoid colors that are too light (poor contrast on white background)
    // This is a basic check, better methods exist
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    if (r > 200 && g > 200 && b > 200) {
      return getRandomColor(); // Retry if too light
    }
    return color;
  }

  // Determine if black or white text is better contrast for a given hex color
  function getContrastYIQ(hexcolor) {
    if (hexcolor.startsWith("#")) {
      hexcolor = hexcolor.slice(1);
    }
    const r = parseInt(hexcolor.substr(0, 2), 16);
    const g = parseInt(hexcolor.substr(2, 2), 16);
    const b = parseInt(hexcolor.substr(4, 2), 16);
    const yiq = (r * 299 + g * 587 + b * 114) / 1000;
    return yiq >= 128 ? "#000000" : "#FFFFFF"; // Return black for light bg, white for dark bg
  }

  // Simple HTML escaping
  function escapeHtml(unsafe) {
    if (!unsafe) return "";
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // --- Download Helper Function ---
  function downloadContent(content, filename, mimeType = "application/json") {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.style.display = "none"; // Keep it hidden
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    // Cleanup: Use setTimeout to allow download initiation before revoking
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100); // 100ms delay seems safe
  }

  // --- Save JSON Annotations Function ---
  function saveJsonAnnotations() {
    if (imageData.length === 0) {
      alert("No images loaded to export annotations for.");
      return;
    }
    const hasAnnotations = imageData.some(
      (imgData) => imgData.boxes && imgData.boxes.length > 0,
    );
    if (!hasAnnotations) {
      // Confirm if user wants to export empty structure
      if (
        !confirm(
          "No annotations have been made. Do you want to export the structure anyway (with empty annotation lists)?",
        )
      ) {
        return;
      }
    }

    const allAnnotations = {
      labels: labels.map((l) => ({ name: l.name, color: l.color })), // Include labels used
      annotations_by_image: imageData.map((imgData) => ({
        image_filename: imgData.filename,
        image_width: imgData.originalWidth,
        image_height: imgData.originalHeight,
        // Convert CANVAS coordinates back to ORIGINAL image coordinates for export
        boxes: imgData.boxes
          .map((box) => {
            const scale = imgData.scaleRatio; // The ratio used for THIS image
            // Ensure division by scale doesn't result in NaN or Infinity if scale is 0 or invalid
            const safeScale = scale > 0 ? scale : 1;
            const x_min = Math.round(box.x / safeScale);
            const y_min = Math.round(box.y / safeScale);
            const x_max = Math.round((box.x + box.width) / safeScale);
            const y_max = Math.round((box.y + box.height) / safeScale);

            // Clamp coordinates to be within original image dimensions
            const clamped_x_min = Math.max(
              0,
              Math.min(x_min, imgData.originalWidth),
            );
            const clamped_y_min = Math.max(
              0,
              Math.min(y_min, imgData.originalHeight),
            );
            const clamped_x_max = Math.max(
              clamped_x_min,
              Math.min(x_max, imgData.originalWidth),
            );
            const clamped_y_max = Math.max(
              clamped_y_min,
              Math.min(y_max, imgData.originalHeight),
            );

            return {
              // Use clamped coordinates
              x_min: clamped_x_min,
              y_min: clamped_y_min,
              x_max: clamped_x_max,
              y_max: clamped_y_max,
              label: box.label,
            };
          })
          .filter((b) => b.x_max - b.x_min > 0 && b.y_max - b.y_min > 0), // Filter out zero-area boxes after conversion/clamping
      })),
    };
    const jsonStr = JSON.stringify(allAnnotations, null, 2); // Pretty print JSON
    console.log("Exporting all annotations as JSON.");
    downloadContent(
      jsonStr,
      `all_annotations_${Date.now()}.json`,
      "application/json",
    );
    // alert("Annotation JSON for all images prepared for download."); // Alert might be annoying if downloading many files
  }

  // --- Export YOLO Annotations Function ---
  function exportYoloAnnotations() {
    if (labels.length === 0) {
      alert(
        "Please define labels before exporting in YOLO format. The order matters.",
      );
      return;
    }
    if (imageData.length === 0) {
      alert("No images loaded to export annotations for.");
      return;
    }

    // Create a map of label name to its index (0-based) based on the order in the 'labels' array
    const labelIndexMap = new Map(
      labels.map((label, index) => [label.name, index]),
    );
    console.log("Label Map for YOLO Export:", labelIndexMap);

    let exportedFiles = 0;
    let skippedImages = 0;
    let totalSkippedBoxes = 0;

    imageData.forEach((imgData) => {
      if (!imgData.boxes || imgData.boxes.length === 0) {
        skippedImages++;
        return; // Skip images with no boxes
      }

      let yoloContent = "";
      let skippedBoxesInImage = 0;

      imgData.boxes.forEach((box) => {
        const labelIndex = labelIndexMap.get(box.label);

        // Check if the label exists in our defined labels map
        if (labelIndex === undefined) {
          console.warn(
            `Skipping box: Label "${box.label}" not found in defined labels list for image ${imgData.filename}. Please add it to the Labels section.`,
          );
          skippedBoxesInImage++;
          return; // Skip this box
        }

        // Convert CANVAS coordinates back to ORIGINAL coordinates
        const scale = imgData.scaleRatio;
        const safeScale = scale > 0 ? scale : 1; // Prevent division by zero

        const original_x_min = box.x / safeScale;
        const original_y_min = box.y / safeScale;
        const original_box_width = box.width / safeScale;
        const original_box_height = box.height / safeScale;

        // Calculate center coordinates in original dimensions
        const original_x_center = original_x_min + original_box_width / 2;
        const original_y_center = original_y_min + original_box_height / 2;

        // Normalize coordinates relative to original image dimensions
        const norm_x_center = original_x_center / imgData.originalWidth;
        const norm_y_center = original_y_center / imgData.originalHeight;
        const norm_width = original_box_width / imgData.originalWidth;
        const norm_height = original_box_height / imgData.originalHeight;

        // --- Validation and Clamping ---
        if (
          isNaN(norm_x_center) ||
          isNaN(norm_y_center) ||
          isNaN(norm_width) ||
          isNaN(norm_height) ||
          imgData.originalWidth <= 0 ||
          imgData.originalHeight <= 0 // Added check for valid image dimensions
        ) {
          console.error(
            `Invalid calculation result for box (label: ${box.label}) in image ${imgData.filename}. ` +
              `Orig Img W: ${imgData.originalWidth}, H: ${imgData.originalHeight}, Scale: ${scale}. ` +
              `Norm Center: (${norm_x_center}, ${norm_y_center}), Norm Size: (${norm_width}, ${norm_height}). Skipping box.`,
          );
          skippedBoxesInImage++;
          return;
        }
        // Clamp values strictly between 0.0 and 1.0 for YOLO format
        const clamp = (val) => Math.max(0.0, Math.min(1.0, val));

        // Format: class_id center_x center_y width height (all normalized)
        yoloContent += `${labelIndex} ${clamp(norm_x_center).toFixed(6)} ${clamp(norm_y_center).toFixed(6)} ${clamp(norm_width).toFixed(6)} ${clamp(norm_height).toFixed(6)}\n`;
      });

      totalSkippedBoxes += skippedBoxesInImage;

      // Only download if there is valid content for this image
      if (yoloContent.length > 0) {
        // Derive filename: remove original extension, add .txt
        const baseFilename =
          imgData.filename.substring(0, imgData.filename.lastIndexOf(".")) ||
          imgData.filename; // Handle names with no extension
        const yoloFilename = `${baseFilename}.txt`;

        downloadContent(yoloContent, yoloFilename, "text/plain");
        exportedFiles++;
      } else if (imgData.boxes.length > 0) {
        // Log if an image had boxes, but all were skipped
        console.warn(
          `No valid YOLO annotations generated for image ${imgData.filename} (all ${imgData.boxes.length} boxes were skipped).`,
        );
        skippedImages++;
      }
    }); // End loop through imageData

    // --- Final User Feedback ---
    let message = "";
    if (exportedFiles > 0) {
      message += `${exportedFiles} YOLO annotation file(s) prepared for download.\n`;
    }
    if (skippedImages > 0) {
      message += `${skippedImages} image(s) were skipped (no valid annotations).\n`;
    }
    if (totalSkippedBoxes > 0) {
      message += `${totalSkippedBoxes} individual bounding box(es) were skipped (e.g., unknown label, invalid calculation).\n`;
    }

    if (message) {
      alert(message.trim() + "\nCheck console for details.");
    } else if (imageData.length > 0) {
      // This case means images were loaded, but maybe no boxes drawn at all
      alert("No annotations found to export in YOLO format.");
    }
    // No alert if no images were loaded initially (already handled)
  }

  // --- Function to Delete Current Image ---
  function deleteCurrentImage() {
    if (
      currentImageIndex < 0 ||
      currentImageIndex >= imageData.length ||
      isPredicting
    ) {
      console.warn(
        "Delete button clicked but no valid image selected or prediction in progress.",
      );
      return;
    }

    const imageToDelete = imageData[currentImageIndex];

    // Confirmation dialog
    if (
      !confirm(
        `Are you sure you want to delete image "${imageToDelete.filename}"? \nAll its annotations will be permanently lost.`,
      )
    ) {
      return; // User cancelled
    }

    console.log(
      `Deleting image index ${currentImageIndex}: ${imageToDelete.filename}`,
    );

    // Remove the image data from the array
    imageData.splice(currentImageIndex, 1);

    let nextIndexToLoad = -1; // Default: no image loaded state

    if (imageData.length === 0) {
      // No images left
      nextIndexToLoad = -1;
      console.log("Last image deleted. Clearing canvas.");
    } else if (currentImageIndex >= imageData.length) {
      // If the deleted image was the last one in the list, load the new last one
      nextIndexToLoad = imageData.length - 1;
      console.log("Deleted last image in list. Loading new last image.");
    } else {
      // Otherwise, load the image that shifted into the current index position
      // The index itself doesn't need to change conceptually, but we reload it
      nextIndexToLoad = currentImageIndex;
      console.log(
        "Deleted image. Loading next image in sequence (which is now at the same index).",
      );
    }

    // Load the determined next state
    if (nextIndexToLoad === -1) {
      clearCanvasAndState(); // Clears canvas, resets state, updates UI
    } else {
      // We need to temporarily set currentImageIndex to -1 before loading,
      // otherwise loadImageData might think it's saving state for the wrong index
      // This is a bit of a workaround for how state saving is implicitly handled.
      const targetIndex = nextIndexToLoad;
      currentImageIndex = -1; // Reset before loading
      loadImageData(targetIndex); // Load the appropriate image
    }
  }

  // --- Keyboard Shortcut Handler Function ---
  function handleKeyDown(event) {
    // Ignore shortcuts if focus is on an input field or textarea
    const activeElement = document.activeElement;
    const isInputFocused =
      activeElement &&
      (activeElement.tagName === "INPUT" ||
        activeElement.tagName === "TEXTAREA" ||
        activeElement.tagName === "SELECT");

    if (isInputFocused) {
      return; // Don't interfere with typing
    }

    // Ignore shortcuts if modifier keys (Ctrl, Alt, Meta) are pressed,
    // unless specifically designing a shortcut with them.
    if (event.ctrlKey || event.altKey || event.metaKey) {
      return;
    }

    // Ignore if prediction is in progress
    if (isPredicting) {
      console.log("Keydown ignored: Prediction in progress.");
      return;
    }

    switch (event.key.toLowerCase()) {
      case "f": // Next image (like 'forward')
        // Check if the button itself is enabled
        if (!nextImageBtn.disabled) {
          console.log("Shortcut 'f' pressed: Navigating next");
          nextImageBtn.click(); // Simulate click
          event.preventDefault(); // Prevent potential default browser actions for 'f'
        } else {
          console.log(
            "Shortcut 'f' pressed: Navigation disabled (at end or predicting)",
          );
        }
        break;

      case "r": // Previous image (like arrow left often used in viewers, or 'd' on qwerty) - Changed from 'r'
        // Check if the button itself is enabled
        if (!prevImageBtn.disabled) {
          console.log("Shortcut 'r' pressed: Navigating previous");
          prevImageBtn.click(); // Simulate click
          event.preventDefault(); // Prevent potential default browser actions for 'd'
        } else {
          console.log(
            "Shortcut 'r' pressed: Navigation disabled (at start or predicting)",
          );
        }
        break;

      case "d": // Switch to Draw tool
        if (!drawBoxBtn.disabled) {
          console.log("Shortcut 'd' pressed: Switching to Draw tool");
          switchTool("draw");
          event.preventDefault();
        }
        break;

      case "e": // Switch to Edit tool
        if (!editBoxBtn.disabled) {
          console.log("Shortcut 'e' pressed: Switching to Edit tool");
          switchTool("edit");
          event.preventDefault();
        }
        break;

      case "delete": // Delete selected annotation (if in edit mode and one is selected conceptually)
      case "backspace": // Also often used for deletion
        // This requires knowing which annotation is 'selected'. Currently, we only
        // select via resize handles. A more robust selection mechanism would be needed
        // for a reliable delete shortcut.
        // Placeholder logic: If in edit mode and a box was just being resized, delete it? Risky.
        // A safer approach needs explicit selection (e.g., clicking a box selects it).
        // console.log("Shortcut 'Delete/Backspace' pressed: Delete Annotation (Not fully implemented)");
        // TODO: Implement annotation selection first
        break;

      // Add more shortcuts as needed...
    }
  }

  // --- Initial Setup on Page Load ---
  function initializeApp() {
    console.log("Initializing Laibel Application...");
    updateLabelsList(); // Setup labels sidebar (might be empty)
    updateAnnotationsList(); // Setup annotations sidebar (will be empty)
    updateNavigationUI(); // Setup initial state of nav buttons/info
    switchTool("draw"); // Set default tool
    redrawCanvas(); // Draw initial placeholder
    console.log("Initialization complete.");
  }

  // Run initialization
  initializeApp();
});
