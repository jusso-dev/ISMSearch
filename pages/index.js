import React, { useState } from 'react';
import styles from '../styles/Home.module.css'
import { useForm } from "react-hook-form";
import ResultsCard from '../components/ResultsCard'
import SearchInfo from '../components/SearchInfo'

export default function Home() {

  const { register, handleSubmit, errors } = useForm();
  const [results, setResults] = useState([]);
  const [error, setError] = useState("");

  const searchQuery = async (data) => {
    let res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/api/ism?queryLimit=${data.numberOfResults}&searchQuery=${data.searchTerm}`)
    if (res.ok) {
      let json = await res.json()
      setResults(json)
      return
    } else {
      setError("An error occurred. Please try again later.")
      return
    }
  }

  return (
    <div className={styles.container}>
      <main className={styles.main}>
        <h1 className={styles.title}>
          ISM Search
        </h1>

        <p className={styles.description}>
          Get started by entering a search term below...
        </p>

        <div className={styles.card}>
          <strong><a href='/disclaimer'>Disclaimer</a></strong>
        </div>

        <div className={styles.card}>
          <p>Last updated: 22/01/2021</p>
          <br />
          <h3>Coming soon...</h3>
          <li>Export to csv function</li>
          <li>Notification of new ISM version</li>
          <li>Searchable previous versions of the ISM</li>
        </div>

        <form onSubmit={handleSubmit(searchQuery)}>
          
          {errors.searchTerm && <p className={styles.span}>This field is required</p>}

          <input placeholder={"Enter search term..."} style={{ borderRadius: '25px', width: '100%', padding: '12px 20px', margin: '8px 0px', border: '2px solid black' }} name="searchTerm" ref={register({ required: true })} />
          <br />
          <input defaultValue={10} style={{ borderRadius: '25px', width: '20%', padding: '12px 20px', margin: '8px 0px', border: '2px solid black' }} type="number" name="numberOfResults" ref={register({ required: true })} min="1" max="800"></input>
          <br />

          <button style={{ borderRadius: '25px', backgroundColor: '#4ecca3', border: 'none', color: '#eeeeee', padding: '16px 32px', width: '100%' }} type="submit">Submit</button>
        </form>

        {results?.hits?.length < 1 &&
          <div className={styles.card}>
            <p>No results...</p>
            {error && <p>{error}</p>}
          </div>
        }

        {results?.hits?.length > 1 &&
          <SearchInfo results={results} />
        }

        {results?.hits?.length > 1 &&
          <ResultsCard results={results} />
        }

      </main>

      <footer className={styles.footer}>
        &copy; - Justin Middler 2021
      </footer>
    </div>
  )
}
