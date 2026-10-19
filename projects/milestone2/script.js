'use strict';

const API = 'https://openlibrary.org';
const PAGE_SIZE = 10;
const MAX_RESULTS = 60;

// Change these Work IDs to personalize your collection.
// Titles and book information come from the API.
const BOOKSHELF_IDS = [
  'OL18417W',
  'OL27448W',
  'OL27482W',
  'OL27513W'
];

const statusLine = document.querySelector('#status');

function workId(key) {
  const id = String(key || '').replace(/^\/works\//, '');
  return /^OL\d+W$/.test(id) ? id : null;
}

async function getJSON(url, signal) {
  const response = await fetch(url, { signal });

  if (!response.ok) {
    throw new Error(`Open Library returned HTTP ${response.status}`);
  }

  return response.json();
}

function element(tag, text, className) {
  const node = document.createElement(tag);

  if (text !== undefined) {
    node.textContent = text;
  }

  if (className) {
    node.className = className;
  }

  return node;
}

function cover(id, title, size) {
  const frame = element('div', undefined, 'cover-frame');

  const fallback = () => {
    frame.replaceChildren(
      element('span', 'Cover not available')
    );
  };

  if (!Number.isInteger(id) || id <= 0) {
    fallback();
    return frame;
  }

  const img = document.createElement('img');
  img.alt = `Cover of ${title}`;
  img.loading = 'lazy';

  // Return an error for missing images so the fallback appears.
  img.src =
    `https://covers.openlibrary.org/b/id/${id}-${size}.jpg?default=false`;

  img.addEventListener('error', fallback, { once: true });

  frame.append(img);
  return frame;
}

function card(book, id, coverId) {
  const article = element('article', undefined, 'book-card');
  const title = book.title || 'Untitled book';

  article.append(cover(coverId, title, 'S'));

  const heading = element('h2');
  const link = element('a', title);

  link.href = `details.html?work=${encodeURIComponent(id)}`;

  heading.append(link);
  article.append(heading);

  if (Array.isArray(book.author_name)) {
    article.append(
      element('p', book.author_name.join(', '))
    );
  }

  return article;
}

function setupSearch() {
  const form = document.querySelector('#search-form');
  const input = document.querySelector('#search-term');
  const results = document.querySelector('#results');
  const pagination = document.querySelector('#pagination');
  const select = document.querySelector('#page-select');

  let currentTerm = '';
  let controller;

  async function search(term, page) {
    // Stop older searches from overwriting newer results.
    if (controller) {
      controller.abort();
    }

    controller = new AbortController();
    const active = controller;

    results.replaceChildren();
    pagination.hidden = true;

    if (!term) {
      statusLine.textContent =
        'Please enter a title, author, or topic to search.';
      return;
    }

    statusLine.textContent = `Searching for “${term}”…`;

    const params = new URLSearchParams({
      q: term,
      limit: PAGE_SIZE,
      page: page,
      fields: 'key,title,cover_i,author_name'
    });

    try {
      const data = await getJSON(
        `${API}/search.json?${params}`,
        active.signal
      );

      if (!Array.isArray(data.docs)) {
        throw new Error('Invalid search response');
      }

      const total = Math.min(
        MAX_RESULTS,
        Math.max(
          0,
          Number(data.numFound ?? data.num_found) || 0
        )
      );

      const books = data.docs.slice(
        0,
        Math.min(
          PAGE_SIZE,
          MAX_RESULTS - (page - 1) * PAGE_SIZE
        )
      );

      if (!books.length || !total) {
        statusLine.textContent =
          `No results found for “${term}”. Try different keywords.`;
        return;
      }

      // Loop through the search response's docs array.
      for (const book of books) {
        const id = workId(book.key);

        if (id) {
          results.append(card(book, id, book.cover_i));
        }
      }

      select.replaceChildren();

      const pageCount = Math.ceil(total / PAGE_SIZE);

      for (let number = 1; number <= pageCount; number++) {
        const option = element('option', String(number));
        option.value = number;
        option.selected = number === page;
        select.append(option);
      }

      pagination.hidden = false;

      const first = (page - 1) * PAGE_SIZE + 1;
      const last = first + books.length - 1;

      statusLine.textContent =
        `Showing ${first}–${last} of ${total} available results ` +
        `for “${term}” (maximum 60).`;
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error(error);

        statusLine.textContent =
          'Unable to load search results. Check your connection ' +
          'and click Search to try again.';
      }
    }
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    currentTerm = input.value.trim();

    // Every new search starts on page 1.
    search(currentTerm, 1);
  });

  // Changing pages keeps the last submitted search term.
  select.addEventListener('change', () => {
    search(currentTerm, Number(select.value));
  });
}

async function setupDetails() {
  const params = new URLSearchParams(location.search);
  const id = workId(params.get('work'));

  if (!id) {
    statusLine.textContent =
      'No valid book was selected. Use Home or My Bookshelf ' +
      'to choose a book.';
    return;
  }

  try {
    const book = await getJSON(`${API}/works/${id}.json`);
    const title = book.title || 'Untitled book';

    document.title = `${title} | Kaleb Tura`;

    const layout = element('div', undefined, 'detail-layout');

    const coverId = book.covers?.find(value => {
      return Number.isInteger(value) && value > 0;
    });

    layout.append(cover(coverId, title, 'M'));

    const content = element('div');

    content.append(
      element('h2', title),
      element('p', `Work ID: ${id}`),
      element('h3', 'Description')
    );

    // Descriptions may be text or an object containing value.
    const description =
      typeof book.description === 'string'
        ? book.description
        : book.description?.value;

    const descriptionText =
      typeof description === 'string' && description.trim()
        ? description
        : 'Description not available.';

    content.append(
      element('p', descriptionText, 'description')
    );

    content.append(element('h3', 'Subjects'));

    const subjects = Array.isArray(book.subjects)
      ? book.subjects.slice(0, 10)
      : [];

    if (subjects.length) {
      const list = element('ul', undefined, 'subjects');

      for (const subject of subjects) {
        list.append(element('li', subject));
      }

      content.append(list);
    } else {
      content.append(element('p', 'Subjects not available.'));
    }

    const link = element(
      'a',
      'View this book on Open Library'
    );

    link.href = `${API}/works/${id}`;
    content.append(link);

    layout.append(content);

    document.querySelector('#book-details').append(layout);

    statusLine.textContent = 'Book details loaded.';
  } catch (error) {
    console.error(error);

    statusLine.textContent =
      'Unable to load this book. Check your connection ' +
      'and refresh the page to try again.';
  }
}

async function setupBookshelf() {
  const results = document.querySelector('#results');
  let loaded = 0;

  // Retrieve each selected work from the API.
  for (const id of BOOKSHELF_IDS) {
    try {
      const book = await getJSON(`${API}/works/${id}.json`);

      const coverId = book.covers?.find(value => {
        return Number.isInteger(value) && value > 0;
      });

      results.append(card(book, id, coverId));
      loaded++;
    } catch (error) {
      console.error(error);

      const unavailable = element(
        'article',
        undefined,
        'book-card'
      );

      unavailable.append(
        element('h2', 'Book temporarily unavailable'),
        element('p', `Work ID: ${id}. Refresh to try again.`)
      );

      results.append(unavailable);
    }
  }

  if (loaded === BOOKSHELF_IDS.length) {
    statusLine.textContent = `${loaded} books in my collection.`;
  } else {
    statusLine.textContent =
      `Loaded ${loaded} of ${BOOKSHELF_IDS.length} books. ` +
      'Some requests failed; refresh to try again.';
  }
}

// Run only the code needed by the current page.
const page = document.body.dataset.page;

if (page === 'search') {
  setupSearch();
}

if (page === 'details') {
  setupDetails();
}

if (page === 'bookshelf') {
  setupBookshelf();
}
