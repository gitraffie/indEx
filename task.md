# task.md

## Goal

Create a fully functional website using the HTML files inside the `html` folder.

## Requirements

1. **Use existing resources**

   * Keep all current colors, images, and styles from the provided HTML files.
   * Do not replace or redesign assets—only organize and connect them.

2. **File & Folder Structure**

   * Place all **HTML files** in the `html` folder.
   * Place all **JavaScript files** in the `javascript` folder.
   * Place all **CSS files** in the `css` folder (if not already separated).
   * Use a **modular structure** with includes (e.g., `include("sidebar.html")`, `include("header.html")`, `include("footer.html")`).

3. **Website Functionality**

   * All pages in the `html` folder must be **connected** using proper navigation links.
   * Reusable UI components like **sidebar, navbar, and footer** must be placed in their own separate files and included in every page.
   * Keep all **links and APIs** exactly as they are in the original HTML files.

4. **Best Practices**

   * JavaScript logic must be separated into the `javascript` folder (e.g., `main.js`, `auth.js`, etc.).
   * Avoid inline JS and inline CSS.
   * Ensure clean, maintainable code following standard web development practices.

## Output

A **complete website project** with the following structure:

```
project/
│── html/
│   ├── index.html
│   ├── about.html
│   ├── contact.html
│   └── ...other pages
│
│── components/
│   ├── header.html
│   ├── sidebar.html
│   └── footer.html
│
│── css/
│   └── styles.css
│
│── javascript/
│   ├── main.js
│   ├── auth.js
│   └── ...other scripts
│
│── images/
│   └── (keep all existing images)
│
└── task.md
```

---