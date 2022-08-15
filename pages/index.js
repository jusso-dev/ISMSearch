import React, { useState } from 'react';
import styles from '../styles/Home.module.css'
import { useForm } from "react-hook-form";
import ResultsCard from '../components/ResultsCard'
import SearchInfo from '../components/SearchInfo'
import MessageCard from '../components/MessageCard'
import ErrorCard from '../components/ErrorCard'

function Home({message}) {

  const { register, handleSubmit, errors } = useForm();
  const [results, setResults] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const searchQuery = async (data) => {

    setLoading(true);

    let url = '' 
    if(data.PROTECTED) {
      url = `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/ism?searchFilters=(PROTECTED = Yes AND OFFICIAL = No)&queryLimit=${data.numberOfResults}`
    }
    else if(data.NOTOPORSECRET) {
      url = `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/ism?searchFilters=(TOPSECRET= No AND SECRET = No)&queryLimit=${data.numberOfResults}&searchQuery=${data.searchTerm}`
    }
    else {
      url = `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/ism?queryLimit=${data.numberOfResults}&searchQuery=${data.searchTerm}`
    }

    let res = await fetch(url)
    if (res.ok) {
      let json = await res.json()
      setResults(json)
      setLoading(false)
      return 
    } else {
      setError("An error occurred. This error has been logged. Please try again later.")
      setLoading(false)
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

        <div className={styles.card} style={{textAlign:'center'}}>
          <strong><a href='/disclaimer'>Disclaimer</a></strong>
        </div>

        <div style={{textAlign:'center'}}>
          <a href="https://www.buymeacoffee.com/justinmiddler"><img src="https://img.buymeacoffee.com/button-api/?text=Buy me a coffee&emoji=&slug=justinmiddler&button_colour=FFDD00&font_colour=000000&font_family=Cookie&outline_colour=000000&coffee_colour=ffffff"></img></a>
        </div>

        <MessageCard message={message} />
        {error !== "" && <ErrorCard message={error} />}

        <form onSubmit={handleSubmit(searchQuery)}>
          
          <label>
              Enter search term here.. ie. 0041 or CISO
              <input placeholder={"Enter search term..."} style={{ borderRadius: '25px', width: '100%', padding: '12px 20px', margin: '8px 0px', border: '2px solid black' }} name="searchTerm" ref={register({ required: false })} />
          </label>
          <label>
              Limit results
              <br />
              <input defaultValue={10} style={{ borderRadius: '25px', width: '20%', padding: '12px 20px', margin: '8px 0px', border: '2px solid black' }} type="number" name="numberOfResults" ref={register({ required: false })} min="1" max="800"></input>
          </label>
          <br />
          <label>
              Show me only PROTECTED controls
              <input type={'checkbox'} style={{height:'15px', width:'15px'}} name="PROTECTED" ref={register({ required: false })} />
          </label>
          <br />
          <label>
              Exclude SECRET and TOP SECRET controls from result
              <input type={'checkbox'} style={{height:'15px', width:'15px'}} name="NOTOPORSECRET" ref={register({ required: false })} />
          </label>
          <br />
          <br />
          <button style={{ fontWeight:'bold', borderRadius: '25px', backgroundColor: '#4ecca3', border: 'none', color: '#eeeeee', padding: '16px 32px', width: '100%' }} type="submit">{loading ? 'Loading please wait...' : 'Submit'}</button>
        </form>

        {results?.hits?.length < 1 &&
          <div className={styles.card}>
            <p>No results...</p>
          </div>
        }

        {results?.hits?.length > 0 &&
          <SearchInfo results={results} />
        }

        {results?.hits?.length > 0 &&
          <ResultsCard results={results} />
        }

      </main>

      <footer className={styles.footer}>
          ISM Search &copy; - Justin Middler - {new Date().getFullYear()} - All rights reserved
          <a target='_blank' href='https://ismsearch.statuspage.io/'>View status of ISM Search</a>
      </footer>
    </div>
  )
}

export async function getServerSideProps() {

  let message = { message: '' }

  try {
    let url = `${process.env.NEXT_PUBLIC_API_BASE_URL ?? ''}`
    let res = await fetch(`${url}/api/message`)
    message = await res.json()
  } catch (error) {
    message.message = "Failed to fetch announcement message."
  }

  return {
    props: {
      message: message.message
    },
  }
}

export default Home