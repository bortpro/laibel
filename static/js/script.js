document.addEventListener("DOMContentLoaded", function () {
  // Configuration
  const MAX_WIDTH = 640;
  const MAX_HEIGHT = 480;
  const handleSize = 8;
  const minBoxSize = 5;

  // --- Global State for Multiple Images ---
  let imageData = []; // Array to hold data for all images
  let currentImageIndex = -1; // Index of the currently displayed image
  let image = null; // The actual Image object currently being displayed

  // State related to the *current* image (will be updated on image switch)
  let scaleRatio = 1;
  let originalWidth = 0;
  let originalHeight = 0;
  let currentFilename = "annotated_image";
  let boxes = []; // Holds annotations for the CURRENT image

  // Global labels (shared across images)
  let labels = [];

  // Interaction State
  let currentTool = "draw"; // 'draw' or 'edit'
  let isDrawing = false;
  let isResizing = false;
  let selectedBoxIndex = -1; // Index within the *current* 'boxes' array
  let grabbedHandle = null;
  let startX = 0;
  let startY = 0;

  // Canvas setup
  const canvas = document.getElementById("image-canvas");
  const ctx = canvas.getContext("2d");

  // DOM elements
  const uploadBtn = document.getElementById("upload-btn");
  const imageUpload = document.getElementById("image-upload");
  const saveBtn = document.getElementById("save-btn");
  const exportYoloBtn = document.getElementById("export-yolo-btn");
  const drawBoxBtn = document.getElementById("draw-box-btn");
  const editBoxBtn = document.getElementById("edit-box-btn");
  const addLabelBtn = document.getElementById("add-label-btn");
  const newLabelInput = document.getElementById("new-label"); // Needed for shortcut check
  const labelsList = document.getElementById("labels-list");
  const annotationsList = document.getElementById("annotations-list");
  const prevImageBtn = document.getElementById("prev-image-btn"); // Needed for shortcuts
  const nextImageBtn = document.getElementById("next-image-btn"); // Needed for shortcuts
  const imageInfoSpan = document.getElementById("image-info");
  const deleteImageBtn = document.getElementById("delete-image-btn");

  // --- Event Listeners ---
  drawBoxBtn.addEventListener("click", () => switchTool("draw"));
  editBoxBtn.addEventListener("click", () => switchTool("edit"));
  uploadBtn.addEventListener("click", () => {
    imageUpload.click();
  });
  prevImageBtn.addEventListener("click", () => {
    if (currentImageIndex > 0) {
      loadImageData(currentImageIndex - 1);
    }
  });
  nextImageBtn.addEventListener("click", () => {
    if (currentImageIndex < imageData.length - 1) {
      loadImageData(currentImageIndex + 1);
    }
  });
  addLabelBtn.addEventListener("click", addNewLabel);
  newLabelInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      addNewLabel();
    }
  });
  saveBtn.addEventListener("click", saveJsonAnnotations);
  exportYoloBtn.addEventListener("click", exportYoloAnnotations);
  deleteImageBtn.addEventListener("click", deleteCurrentImage);

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
      // edit
      editBoxBtn.classList.add("active");
      drawBoxBtn.classList.remove("active");
      canvas.style.cursor = "default";
      resetDrawState();
    }
    redrawCanvas();
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
    imageData = [];
    currentImageIndex = -1;
    clearCanvasAndState();
    const filePromises = [];
    Array.from(files).forEach((file) => {
      if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        const loadPromise = new Promise((resolve, reject) => {
          reader.onload = function (event) {
            const img = new Image();
            img.onload = function () {
              const data = {
                src: event.target.result,
                filename: file.name,
                originalWidth: img.width,
                originalHeight: img.height,
                scaleRatio: 1,
                boxes: [],
              };
              if (
                data.originalWidth > MAX_WIDTH ||
                data.originalHeight > MAX_HEIGHT
              ) {
                const widthRatio = MAX_WIDTH / data.originalWidth;
                const heightRatio = MAX_HEIGHT / data.originalHeight;
                data.scaleRatio = Math.min(widthRatio, heightRatio);
              }
              imageData.push(data);
              resolve();
            };
            img.onerror = reject;
            img.src = event.target.result;
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        filePromises.push(loadPromise);
      }
    });
    Promise.all(filePromises)
      .then(() => {
        console.log(`Processed ${imageData.length} images.`);
        if (imageData.length > 0) {
          loadImageData(0);
        } else {
          updateNavigationUI();
        }
        imageUpload.value = null;
      })
      .catch((error) => {
        console.error("Error processing files:", error);
        alert(
          "An error occurred while loading images. Please check the console.",
        );
        updateNavigationUI();
        imageUpload.value = null;
      });
  });

  // --- Image Loading and Navigation ---
  function loadImageData(index) {
    if (index < 0 || index >= imageData.length) {
      console.error("Invalid image index requested:", index);
      clearCanvasAndState();
      return;
    }
    currentImageIndex = index;
    const data = imageData[currentImageIndex];
    originalWidth = data.originalWidth;
    originalHeight = data.originalHeight;
    scaleRatio = data.scaleRatio;
    currentFilename = data.filename;
    boxes = data.boxes;
    console.log(`Loading image ${currentImageIndex + 1}: ${currentFilename}`);
    image = new Image();
    image.onload = () => {
      const displayWidth = Math.round(originalWidth * scaleRatio);
      const displayHeight = Math.round(originalHeight * scaleRatio);
      canvas.width = displayWidth;
      canvas.height = displayHeight;
      resetDrawState();
      resetEditState();
      redrawCanvas();
      updateAnnotationsList();
      updateNavigationUI();
    };
    image.onerror = () => {
      console.error("Error loading image source for display:", data.filename);
      alert(`Error loading image: ${data.filename}`);
      clearCanvasAndState();
    };
    image.src = data.src;
  }
  function clearCanvasAndState() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    image = null;
    boxes = [];
    originalWidth = 0;
    originalHeight = 0;
    scaleRatio = 1;
    currentFilename = "annotated_image";
    currentImageIndex = -1;
    resetDrawState();
    resetEditState();
    updateAnnotationsList();
    updateNavigationUI();
    console.log("Canvas and state cleared.");
  }
  function updateNavigationUI() {
    const hasImages = imageData.length > 0;
    deleteImageBtn.disabled = !hasImages;

    if (!hasImages) {
      imageInfoSpan.textContent = "No images loaded";
      prevImageBtn.disabled = true;
      nextImageBtn.disabled = true;
    } else {
      if (currentImageIndex >= 0 && currentImageIndex < imageData.length) {
        imageInfoSpan.textContent = `${currentImageIndex + 1} / ${imageData.length} (${imageData[currentImageIndex].filename})`;
      } else {
        imageInfoSpan.textContent = `? / ${imageData.length}`;
      }
      prevImageBtn.disabled = currentImageIndex <= 0;
      nextImageBtn.disabled = currentImageIndex >= imageData.length - 1;
    }
  }

  // --- Canvas Event Handlers ---
  canvas.addEventListener("mousedown", handleMouseDown);
  canvas.addEventListener("mousemove", handleMouseMove);
  canvas.addEventListener("mouseup", handleMouseUp);
  canvas.addEventListener("mouseleave", handleMouseLeave);

  function getMousePos(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
  function getHandleUnderMouse(x, y) {
    for (let i = boxes.length - 1; i >= 0; i--) {
      const box = boxes[i];
      const hs = handleSize / 2;
      if (
        x >= box.x - hs &&
        x <= box.x + hs &&
        y >= box.y - hs &&
        y <= box.y + hs
      )
        return { boxIndex: i, handle: "tl" };
      if (
        x >= box.x + box.width - hs &&
        x <= box.x + box.width + hs &&
        y >= box.y - hs &&
        y <= box.y + hs
      )
        return { boxIndex: i, handle: "tr" };
      if (
        x >= box.x - hs &&
        x <= box.x + hs &&
        y >= box.y + box.height - hs &&
        y <= box.y + box.height + hs
      )
        return { boxIndex: i, handle: "bl" };
      if (
        x >= box.x + box.width - hs &&
        x <= box.x + box.width + hs &&
        y >= box.y + box.height - hs &&
        y <= box.y + box.height + hs
      )
        return { boxIndex: i, handle: "br" };
    }
    return null;
  }
  function handleMouseDown(e) {
    if (!image) return;
    const pos = getMousePos(e);
    startX = pos.x;
    startY = pos.y;
    if (currentTool === "draw") {
      isDrawing = true;
      resetEditState();
    } else if (currentTool === "edit") {
      resetDrawState();
      const handleInfo = getHandleUnderMouse(pos.x, pos.y);
      if (handleInfo) {
        isResizing = true;
        selectedBoxIndex = handleInfo.boxIndex;
        grabbedHandle = handleInfo.handle;
      } else {
        resetEditState();
        redrawCanvas();
      }
    }
  }
  function handleMouseMove(e) {
    if (!image) return;
    const pos = getMousePos(e);
    const currentX = pos.x;
    const currentY = pos.y;
    if (currentTool === "draw" && isDrawing) {
      redrawCanvas();
      ctx.strokeStyle = "#4a6cf7";
      ctx.lineWidth = 2;
      ctx.strokeRect(startX, startY, currentX - startX, currentY - startY);
    } else if (currentTool === "edit" && isResizing) {
      const box = boxes[selectedBoxIndex];
      let newX = box.x,
        newY = box.y,
        newWidth = box.width,
        newHeight = box.height;
      switch (grabbedHandle) {
        case "tl":
          newWidth = box.x + box.width - currentX;
          newHeight = box.y + box.height - currentY;
          newX = currentX;
          newY = currentY;
          break;
        case "tr":
          newWidth = currentX - box.x;
          newHeight = box.y + box.height - currentY;
          newY = currentY;
          break;
        case "bl":
          newWidth = box.x + box.width - currentX;
          newHeight = currentY - box.y;
          newX = currentX;
          break;
        case "br":
          newWidth = currentX - box.x;
          newHeight = currentY - box.y;
          break;
      }
      box.x = newX;
      box.y = newY;
      box.width = newWidth;
      box.height = newHeight;
      redrawCanvas();
    } else if (currentTool === "edit" && !isResizing) {
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
            break;
        }
      } else {
        canvas.style.cursor = "default";
      }
    }
  }
  function handleMouseUp(e) {
    if (currentTool === "draw" && isDrawing) {
      isDrawing = false;
      const pos = getMousePos(e);
      const endX = pos.x;
      const endY = pos.y;
      const width = endX - startX;
      const height = endY - startY;
      if (
        Math.abs(width) >= minBoxSize &&
        Math.abs(height) >= minBoxSize &&
        currentImageIndex !== -1
      ) {
        const newBox = {
          x: Math.min(startX, endX),
          y: Math.min(startY, endY),
          width: Math.abs(width),
          height: Math.abs(height),
          label: labels.length > 0 ? labels[0].name : "unlabeled",
        };
        imageData[currentImageIndex].boxes.push(newBox);
        updateAnnotationsList();
      }
      redrawCanvas();
    } else if (currentTool === "edit" && isResizing) {
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
      }
      resetEditState();
      redrawCanvas();
      updateAnnotationsList();
    }
  }
  function handleMouseLeave(e) {
    if (isDrawing) {
      isDrawing = false;
      redrawCanvas();
    }
    if (isResizing) {
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
      }
      resetEditState();
      redrawCanvas();
      updateAnnotationsList();
      canvas.style.cursor = "default";
    } else if (currentTool === "edit") {
      canvas.style.cursor = "default";
    }
  }

  // --- Drawing Canvas ---
  function redrawCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (image) {
      const expectedWidth = Math.round(originalWidth * scaleRatio);
      const expectedHeight = Math.round(originalHeight * scaleRatio);
      if (canvas.width !== expectedWidth || canvas.height !== expectedHeight) {
        canvas.width = expectedWidth;
        canvas.height = expectedHeight;
      }
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    } else {
      ctx.fillStyle = "#f0f0f0";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#888";
      ctx.font = "16px Arial";
      ctx.textAlign = "center";
      ctx.fillText(
        "Upload images to begin",
        canvas.width / 2,
        canvas.height / 2,
      );
      return;
    }
    boxes.forEach((box, index) => {
      const labelObj = labels.find((l) => l.name === box.label);
      const color = labelObj ? labelObj.color : "#CCCCCC";
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(box.x, box.y, box.width, box.height);
      if (box.label) {
        ctx.fillStyle = color;
        const text = box.label;
        const textMetrics = ctx.measureText(text);
        const textWidth = textMetrics.width;
        ctx.fillRect(box.x, box.y - 16, textWidth + 10, 16);
        ctx.fillStyle = "white";
        ctx.font = "12px Arial";
        ctx.fillText(text, box.x + 5, box.y - 4);
      }
      if (currentTool === "edit") {
        ctx.fillStyle = color;
        ctx.strokeStyle = "white";
        ctx.lineWidth = 1;
        const hs = handleSize / 2;
        ctx.fillRect(box.x - hs, box.y - hs, handleSize, handleSize);
        ctx.strokeRect(box.x - hs, box.y - hs, handleSize, handleSize);
        ctx.fillRect(
          box.x + box.width - hs,
          box.y - hs,
          handleSize,
          handleSize,
        );
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
        );
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
        );
        ctx.strokeRect(
          box.x + box.width - hs,
          box.y + box.height - hs,
          handleSize,
          handleSize,
        );
      }
    });
  }

  // --- Label Management ---
  function addNewLabel() {
    const labelName = newLabelInput.value.trim();
    if (labelName && !labels.some((l) => l.name === labelName)) {
      const color = getRandomColor();
      labels.push({ name: labelName, color: color });
      updateLabelsList();
      updateAnnotationsList();
      if (labels.length === 1 && currentImageIndex !== -1) {
        imageData[currentImageIndex].boxes.forEach((box) => {
          if (box.label === "unlabeled") {
            box.label = labelName;
          }
        });
        redrawCanvas();
        updateAnnotationsList();
      }
      newLabelInput.value = "";
    } else if (!labelName) {
      alert("Please enter a label name.");
    } else {
      alert(`Label "${labelName}" already exists.`);
    }
  }
  function updateLabelsList() {
    labelsList.innerHTML = "";
    labels.forEach((label, index) => {
      const labelItem = document.createElement("div");
      labelItem.className = "label-item";
      labelItem.style.cursor = "pointer";
      const labelDisplay = document.createElement("div");
      labelDisplay.innerHTML = `<span class="label-color" style="background-color: ${label.color}"></span>${label.name}`;
      labelItem.onclick = () => {
        console.log(
          `Selected ${label.name} as default for next box (if unlabeled).`,
        );
      };
      const deleteBtn = document.createElement("button");
      deleteBtn.className = "btn delete-label-btn";
      deleteBtn.textContent = "X";
      deleteBtn.title = `Delete label "${label.name}"`;
      deleteBtn.onclick = (e) => {
        e.stopPropagation();
        const labelNameToDelete = label.name;
        labels.splice(index, 1);
        imageData.forEach((imgData) => {
          imgData.boxes.forEach((box) => {
            if (box.label === labelNameToDelete) {
              box.label = labels.length > 0 ? labels[0].name : "unlabeled";
            }
          });
        });
        updateLabelsList();
        updateAnnotationsList();
        redrawCanvas();
      };
      labelItem.appendChild(labelDisplay);
      labelItem.appendChild(deleteBtn);
      labelsList.appendChild(labelItem);
    });
  }

  // --- Annotation List Management ---
  function updateAnnotationsList() {
    annotationsList.innerHTML = "";
    if (currentImageIndex === -1 || !imageData[currentImageIndex]) {
      boxes = [];
      return;
    }
    boxes = imageData[currentImageIndex].boxes;
    boxes.forEach((box, index) => {
      const annotationItem = document.createElement("div");
      annotationItem.className = "annotation-item";
      const labelSelect = document.createElement("select");
      labelSelect.className = "annotation-label-select";
      if (
        labels.length === 0 ||
        box.label === "unlabeled" ||
        !labels.some((l) => l.name === box.label)
      ) {
        const option = document.createElement("option");
        option.value = "unlabeled";
        option.textContent = "unlabeled";
        option.selected =
          box.label === "unlabeled" ||
          !labels.some((l) => l.name === box.label);
        labelSelect.appendChild(option);
      }
      labels.forEach((label) => {
        const option = document.createElement("option");
        option.value = label.name;
        option.textContent = label.name;
        if (box.label === label.name) {
          option.selected = true;
        }
        labelSelect.appendChild(option);
      });
      labelSelect.onchange = (e) => {
        imageData[currentImageIndex].boxes[index].label = e.target.value;
        redrawCanvas();
      };
      const deleteBtn = document.createElement("button");
      deleteBtn.className = "btn delete-annotation-btn";
      deleteBtn.textContent = "X";
      deleteBtn.title = "Delete this annotation";
      deleteBtn.onclick = () => {
        if (isResizing && selectedBoxIndex === index) {
          resetEditState();
          canvas.style.cursor = "default";
        }
        imageData[currentImageIndex].boxes.splice(index, 1);
        if (selectedBoxIndex > index) {
          selectedBoxIndex--;
        } else if (selectedBoxIndex === index) {
          resetEditState();
          canvas.style.cursor = "default";
        }
        updateAnnotationsList();
        redrawCanvas();
      };
      annotationItem.appendChild(labelSelect);
      annotationItem.appendChild(deleteBtn);
      annotationsList.appendChild(annotationItem);
    });
  }

  // --- Utilities ---
  function getRandomColor() {
    const letters = "0123456789ABCDEF";
    let color = "#";
    for (let i = 0; i < 6; i++) {
      color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
  }

  // --- Download Helper Function ---
  function downloadContent(content, filename, mimeType = "application/json") {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // --- Save JSON Annotations Function ---
  function saveJsonAnnotations() {
    if (imageData.length === 0) {
      alert("No images or annotations to save!");
      return;
    }
    const hasAnnotations = imageData.some(
      (imgData) => imgData.boxes && imgData.boxes.length > 0,
    );
    if (!hasAnnotations) {
      alert("No annotations have been made to save!");
      return;
    }

    const allAnnotations = {
      labels: labels,
      annotations_by_image: imageData.map((imgData) => ({
        image_filename: imgData.filename,
        image_width: imgData.originalWidth,
        image_height: imgData.originalHeight,
        boxes: imgData.boxes.map((box) => ({
          x_min: Math.round(box.x / imgData.scaleRatio),
          y_min: Math.round(box.y / imgData.scaleRatio),
          x_max: Math.round((box.x + box.width) / imgData.scaleRatio),
          y_max: Math.round((box.y + box.height) / imgData.scaleRatio),
          label: box.label,
        })),
      })),
    };
    const jsonStr = JSON.stringify(allAnnotations, null, 2);
    console.log("Saving all annotations as JSON:", jsonStr);
    downloadContent(jsonStr, `all_annotations.json`, "application/json");
    alert("Annotation JSON for all images prepared for download.");
  }

  // --- Export YOLO Annotations Function ---
  function exportYoloAnnotations() {
    if (labels.length === 0) {
      alert("Please define labels before exporting in YOLO format.");
      return;
    }
    if (imageData.length === 0) {
      alert("No images loaded to export annotations for.");
      return;
    }

    const labelIndexMap = new Map(
      labels.map((label, index) => [label.name, index]),
    );
    console.log("Label Map for YOLO:", labelIndexMap);

    let exportedFiles = 0;

    imageData.forEach((imgData) => {
      if (!imgData.boxes || imgData.boxes.length === 0) {
        return;
      }

      let yoloContent = "";
      let skippedBoxes = 0;

      imgData.boxes.forEach((box) => {
        const labelIndex = labelIndexMap.get(box.label);
        if (labelIndex === undefined) {
          console.warn(
            `Skipping box with unknown label "${box.label}" in image ${imgData.filename}`,
          );
          skippedBoxes++;
          return;
        }

        const original_x_min = box.x / imgData.scaleRatio;
        const original_y_min = box.y / imgData.scaleRatio;
        const original_box_width = box.width / imgData.scaleRatio;
        const original_box_height = box.height / imgData.scaleRatio;

        const original_x_center = original_x_min + original_box_width / 2;
        const original_y_center = original_y_min + original_box_height / 2;

        const norm_x_center = original_x_center / imgData.originalWidth;
        const norm_y_center = original_y_center / imgData.originalHeight;
        const norm_width = original_box_width / imgData.originalWidth;
        const norm_height = original_box_height / imgData.originalHeight;

        if (
          isNaN(norm_x_center) ||
          isNaN(norm_y_center) ||
          isNaN(norm_width) ||
          isNaN(norm_height)
        ) {
          console.error(
            `Invalid calculation for box in image ${imgData.filename}. Original dimensions: ${imgData.originalWidth}x${imgData.originalHeight}. Skipping box.`,
          );
          skippedBoxes++;
          return;
        }

        const clamp = (val) => Math.max(0.0, Math.min(1.0, val));
        yoloContent += `${labelIndex} ${clamp(norm_x_center).toFixed(6)} ${clamp(norm_y_center).toFixed(6)} ${clamp(norm_width).toFixed(6)} ${clamp(norm_height).toFixed(6)}\n`;
      });

      if (yoloContent.length > 0) {
        const baseFilename =
          imgData.filename.substring(0, imgData.filename.lastIndexOf(".")) ||
          imgData.filename;
        const yoloFilename = `${baseFilename}.txt`;

        downloadContent(yoloContent, yoloFilename, "text/plain");
        exportedFiles++;
      } else if (
        skippedBoxes === imgData.boxes.length &&
        imgData.boxes.length > 0
      ) {
        console.warn(
          `All boxes skipped for image ${imgData.filename} due to unknown labels or calculation errors.`,
        );
      }
    });

    if (exportedFiles > 0) {
      alert(`${exportedFiles} YOLO annotation file(s) prepared for download.`);
    } else {
      const hasAnyAnnotations = imageData.some(
        (imgData) => imgData.boxes && imgData.boxes.length > 0,
      );
      if (!hasAnyAnnotations) {
        alert("No annotations have been made to export.");
      } else {
        alert(
          "No annotations found with recognized labels to export in YOLO format.",
        );
      }
    }
  }

  // --- Function to Delete Current Image ---
  function deleteCurrentImage() {
    if (currentImageIndex < 0 || currentImageIndex >= imageData.length) {
      console.warn(
        "Delete button clicked but no valid image index:",
        currentImageIndex,
      );
      return;
    }

    const imageToDelete = imageData[currentImageIndex];

    if (
      !confirm(
        `Are you sure you want to delete image "${imageToDelete.filename}"? All its annotations will be lost. This cannot be undone.`,
      )
    ) {
      return; // User cancelled
    }

    console.log(
      `Deleting image index ${currentImageIndex}: ${imageToDelete.filename}`,
    );

    imageData.splice(currentImageIndex, 1); // Remove the image data

    let nextIndex = -1; // Default to no image loaded state

    if (imageData.length === 0) {
      nextIndex = -1;
      console.log("Last image deleted. Clearing canvas.");
    } else if (currentImageIndex >= imageData.length) {
      // If deleted the last image, load the new last one
      nextIndex = imageData.length - 1;
      console.log("Deleted last image in list. Loading new last image.");
    } else {
      // Otherwise, load the image that shifted into the current index
      nextIndex = currentImageIndex;
      console.log("Deleted image. Loading next image in sequence.");
    }

    // Load the next state
    if (nextIndex === -1) {
      clearCanvasAndState(); // Clear canvas and update UI
    } else {
      loadImageData(nextIndex); // Load the appropriate image
    }
  }

  // --- Keyboard Shortcut Handler Function ---
  function handleKeyDown(event) {
    // Ignore shortcuts if the user is typing in the label input field
    if (event.target === newLabelInput) {
      return;
    }
    // Ignore shortcuts if modifier keys like Ctrl, Alt, Meta are pressed
    if (event.ctrlKey || event.altKey || event.metaKey) {
      return;
    }

    switch (event.key.toLowerCase()) {
      case "f": // 'f' for Forward (Next)
        if (!nextImageBtn.disabled) {
          console.log("Shortcut 'f' pressed: Navigating next");
          nextImageBtn.click();
        } else {
          console.log("Shortcut 'f' pressed: Already at last image");
        }
        // event.preventDefault(); // Optional: prevent default browser behavior
        break;

      case "r": // 'r' for Reverse (Previous)
        if (!prevImageBtn.disabled) {
          console.log("Shortcut 'r' pressed: Navigating previous");
          prevImageBtn.click();
        } else {
          console.log("Shortcut 'r' pressed: Already at first image");
        }
        // event.preventDefault(); // Optional: prevent default browser behavior
        break;
    }
  }

  // --- Initialize ---
  updateLabelsList();
  updateAnnotationsList();
  updateNavigationUI();
  switchTool("draw");
  redrawCanvas();
});
