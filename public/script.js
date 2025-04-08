document.addEventListener("DOMContentLoaded", () => {
  const editButtons = document.querySelectorAll(".edit-toggle-btn");

  editButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const folderId = btn.dataset.folderId;
      const actionPanel = document.getElementById(`actions-${folderId}`);

      actionPanel.classList.toggle("hidden");
    });
  });

  document.querySelectorAll(".rename-folder-form").forEach((form) => {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const folderId = form.dataset.folderId;
      const newName = form.querySelector('input[name="newName"]').value;

      const res = await fetch(`/folders/${folderId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });

      if (res.ok) {
        location.reload();
      } else {
        alert("Failed to rename folder");
      }
    });
  });

  document.querySelectorAll(".delete-folder-form").forEach((form) => {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const folderId = form.dataset.folderId;

      const confirmed = confirm("Are you sure you want to delete this folder?");
      if (!confirmed) return;

      const res = await fetch(`/folders/${folderId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        location.reload();
      } else {
        const err = await res.json();
        alert(err.message || "Failed to delete folder");
      }
    });
  });

  document.querySelectorAll(".move-file-form").forEach((form) => {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fileId = form.dataset.fileId;
      let folderId = form.querySelector('select[name="folderId"]').value;

      if (folderId === "") {
        folderId = null;
      }

      const res = await fetch(`/files/${fileId}/folder/${folderId || "null"}`, {
        method: "PUT",
      });

      if (res.ok) {
        location.reload();
      } else {
        alert("Failed to move file");
      }
    });
  });

  document.querySelectorAll(".delete-file-form").forEach((form) => {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fileId = form.dataset.fileId;

      const confirmed = confirm("Are you sure you want to delete this file?");
      if (!confirmed) return;

      const res = await fetch(`/files/${fileId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        location.reload();
      } else {
        const err = await res.json();
        alert(err.message || "Failed to delete file");
      }
    });
  });
});
