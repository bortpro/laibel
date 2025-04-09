<div align="center">
  <h1><strong>lAIbel</strong></h1>
</div>

<p align="center">
    </br>
    <img width="100" src=".//laibel.png" alt="laibel logo">
    </br>
</p>

A lightweight image annotation tool designed for efficient labeling of images to create downstream AI models.lAIbel provides a cross-platform browser-based interface for drawing and managing bounding box annotations, streamlining the data preparation phase for computer vision tasks. Labels can be exported in a variety of formats.

**Core Features:**

*   **Bounding Box Annotation:** Draw and resize bounding boxes directly on the canvas.
*   **Annotation Export:**
    *   Export annotations for all images in structured **JSON** format.
    *   Export annotations in the standard **YOLO** `.txt` format, compatible with YOLO & Ultralytics.
*   **Keyboard Shortcuts:** Quick navigation developed thoughtfully for the user to greatly increase labeling speed.

### Tech Stack

lAIbel is built with a focus on simplicity and client-side performance.
*   **Backend:** A minimal Flask(Python) web server is used primarily to serve the HTML, CSS, and JavaScript files. It's designed to be lightweight and easy to deploy.
*   **Frontend:** The core annotation logic, UI interactions, state management, and rendering are handled entirely using vanilla JavaScript, HTML5 Canvas, and CSS. This choice avoids heavy framework dependencies, aiming for fast loading times and a responsive user experience directly in the browser.

### Project Goal

The primary goal of laibel is to accelerate the often tedious process of image annotation. The goal is to develop a tool that is exceptionally fast and intuitive to use, reducing the time and effort required to prepare high-quality datasets for machine learning. By focusing on a streamlined user experience, efficient processing, and compatibility with standard formats like YOLO, lAIbel strives to be a valuable asset in any computer vision practitioner's toolkit. The long-term vision is to make lAIbel one of the fastest and most user-friendly open-source labeling tools available.

**Upcoming Features:**

*   AI-Assisted Labeling: Lightweight background AI model aids in automatic labeling.
*   Active Learning Labeling: Support active learning labeling.
*   Batch Annotation: Automate annotation tasks for large datasets.
*   Performance Optimization: Improve performance for large datasets and complex annotations.
*   Advanced Annotation Tools: Support for other segmentation tasks and integration of custom models, such as versions ofSegment Anything Model (SAM)
*   Integration with AI Models: Train and evaluate AI models directly within the tool.
