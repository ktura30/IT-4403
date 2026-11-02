/* IT 4403 Milestone 3: jQuery AJAX single-page Open Library explorer. */
$(function () {
  'use strict';
  const MAX_RESULTS = 50;
  const PAGE_SIZE = 10;
  let searchBooks = [];
  let currentPage = 1;
  let activeSearch = null;
  let activeDetails = null;
  let detailRequestNumber = 0;
  const detailCache = {};

  function text(value, fallback = 'Not available') {
    return typeof value === 'string' && value.trim() ? value.trim() : fallback;
  }
  function workId(key) {
    const match = typeof key === 'string' && key.match(/^\/works\/(OL\d+W)$/);
    return match ? match[1] : null;
  }
  function coverUrl(id, size) {
    return id ? 'https://covers.openlibrary.org/b/id/' + encodeURIComponent(id) + '-' + size + '.jpg?default=false' : null;
  }
  function createCover(id, size, className) {
    const $fallback = $('<span>', {class: 'cover-placeholder', text: 'No cover'});
    const src = coverUrl(id, size);
    if (!src) return $fallback;
    const $img = $('<img>', {src: src, alt: 'Book cover', loading: 'lazy'});
    if (className) $img.addClass(className);
    $img.on('error', function () { $(this).replaceWith($fallback); });
    return $img;
  }
  function setStatus(selector, message, error) {
    $(selector).text(message).toggleClass('error', !!error);
  }
  function renderItems(selector, books) {
    const $target = $(selector).empty();
    books.forEach(function (book) {
      const id = workId(book.key);
      const $button = $('<button>', {type: 'button', class: 'book'});
      $button.append(createCover(book.coverId, 'S'));
      $button.append($('<span>', {class: 'book-title', text: text(book.title, 'Untitled book')}));
      if (id) $button.on('click', function () { showDetails(book); });
      else $button.prop('disabled', true).attr('title', 'Work details unavailable');
      $target.append($button);
    });
  }
  function renderPage() {
    const pages = Math.ceil(searchBooks.length / PAGE_SIZE);
    const start = (currentPage - 1) * PAGE_SIZE;
    renderItems('#search-results', searchBooks.slice(start, start + PAGE_SIZE));
    $('#pagination').prop('hidden', pages <= 1);
    $('#page-indicator').text('Page ' + currentPage + ' of ' + pages);
    $('#prev-page').prop('disabled', currentPage <= 1);
    $('#next-page').prop('disabled', currentPage >= pages);
  }
  $('#prev-page').on('click', function () { if (currentPage > 1) { currentPage--; renderPage(); } });
  $('#next-page').on('click', function () {
    if (currentPage < Math.ceil(searchBooks.length / PAGE_SIZE)) { currentPage++; renderPage(); }
  });
  $('#search-form').on('submit', function (event) {
    event.preventDefault();
    const term = $('#search-input').val().trim();
    if (!term) { setStatus('#search-status', 'Please enter a title or keyword before searching.', true); return; }
    if (activeSearch) activeSearch.abort();
    searchBooks = [];
    currentPage = 1;
    $('#search-results').empty();
    $('#pagination').prop('hidden', true);
    $('#search-button').prop('disabled', true).text('Searching…');
    setStatus('#search-status', 'Searching Open Library for “' + term + '”…');
    activeSearch = $.ajax({
      url: 'https://openlibrary.org/search.json',
      method: 'GET', dataType: 'json',
      data: {q: term, limit: MAX_RESULTS, fields: 'key,title,author_name,cover_i'}
    }).done(function (data) {
      searchBooks = (Array.isArray(data.docs) ? data.docs : []).slice(0, MAX_RESULTS).map(function (item) {
        return {key: item.key, title: item.title, authors: item.author_name || [], coverId: item.cover_i};
      });
      if (!searchBooks.length) setStatus('#search-status', 'No books found. Try another search term.');
      else { setStatus('#search-status', 'Showing ' + searchBooks.length + ' book(s) for “' + term + '”.'); renderPage(); }
    }).fail(function (_xhr, status) {
      if (status !== 'abort') setStatus('#search-status', 'Search could not be loaded. Check your connection and try again.', true);
    }).always(function () {
      $('#search-button').prop('disabled', false).text('Search');
      activeSearch = null;
    });
  });
  function renderDetails(book, data) {
    const id = workId(book.key);
    const $details = $('#details').empty();
    const coverId = (Array.isArray(data.covers) && data.covers.find(function (x) { return x > 0; })) || book.coverId;
    $details.append(createCover(coverId, 'M', 'detail-cover'));
    $details.append($('<h3>').text(text(data.title || book.title, 'Untitled book')));
    $details.append($('<p>').append($('<strong>').text('Work ID: '), document.createTextNode(id)));
    const authors = Array.isArray(book.authors) && book.authors.length ? book.authors.join(', ') : 'Author information unavailable';
    $details.append($('<p>').append($('<strong>').text('Authors: '), document.createTextNode(authors)));
    const description = typeof data.description === 'string' ? data.description : (data.description && data.description.value);
    $details.append($('<p>').append($('<strong>').text('Description: '), document.createTextNode(text(description, 'No description available.'))));
    $details.append($('<h4>').text('Subjects'));
    if (Array.isArray(data.subjects) && data.subjects.length) {
      const $list = $('<ul>');
      data.subjects.slice(0, 10).forEach(function (subject) { $list.append($('<li>').text(subject)); });
      $details.append($list);
    } else $details.append($('<p>').text('No subjects available.'));
    $details.append($('<p>').append($('<a>', {href: 'https://openlibrary.org' + book.key, target: '_blank', rel: 'noopener noreferrer', text: 'View this book on Open Library'})));
  }
  function showDetails(book) {
    const id = workId(book.key);
    if (!id) return;
    const requestNumber = ++detailRequestNumber;
    if (activeDetails) activeDetails.abort();
    $('#details').empty().append($('<p>', {class: 'status', text: 'Loading book details…'}));
    if (detailCache[id]) { renderDetails(book, detailCache[id]); return; }
    activeDetails = $.ajax({url: 'https://openlibrary.org/works/' + encodeURIComponent(id) + '.json', method: 'GET', dataType: 'json'})
      .done(function (data) { if (requestNumber === detailRequestNumber) { detailCache[id] = data; renderDetails(book, data); } })
      .fail(function (_xhr, status) {
        if (status !== 'abort' && requestNumber === detailRequestNumber) $('#details').text('Unable to load this book’s details. Please select it again to retry.');
      });
  }
  function loadCollection() {
    $('#retry-collection').prop('hidden', true);
    setStatus('#collection-status', 'Loading science fiction collection…');
    $('#collection-results').empty();
    $.ajax({url: 'https://openlibrary.org/subjects/science_fiction.json', method: 'GET', dataType: 'json', data: {limit: 10}})
      .done(function (data) {
        const works = Array.isArray(data.works) ? data.works.slice(0, 10) : [];
        if (!works.length) { setStatus('#collection-status', 'No collection books are currently available.'); return; }
        const books = works.map(function (item) {
          return {key: item.key, title: item.title, coverId: item.cover_id, authors: (item.authors || []).map(function (author) { return author.name; }).filter(Boolean)};
        });
        renderItems('#collection-results', books);
        setStatus('#collection-status', 'Explore these ' + books.length + ' science fiction books.');
      }).fail(function () {
        setStatus('#collection-status', 'The collection could not be loaded. Please try again.', true);
        $('#retry-collection').prop('hidden', false);
      });
  }
  $('#retry-collection').on('click', loadCollection);
  loadCollection();
});
