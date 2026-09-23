import Link from 'next/link';

export default function NotFound(): React.ReactElement {
  return (
    <main className="notFound">
      <div className="notFoundMark">404</div>
      <h1>Страница не найдена</h1>
      <p>Такой страницы не существует или её адрес был изменён.</p>
      <Link className="primaryButton" href="/">Вернуться к подбору</Link>
    </main>
  );
}
