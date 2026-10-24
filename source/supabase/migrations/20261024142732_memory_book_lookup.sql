-- Cover the book-only FK lookup for source deletion/cascades.
create index av_memory_documents_book_id on public.av_memory_documents(book_id);
