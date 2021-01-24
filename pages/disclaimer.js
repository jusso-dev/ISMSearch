import styles from '../styles/Home.module.css'

export default function Disclaimer() {
    return (
        <div className={styles.container}>

            <main className={styles.main}>
                <h1 className={styles.title}>
                    Disclaimer
                </h1>

                <div className={styles.card}>
                        <p>All information presented on this site is a best effort to represent the Australian Information Security Manual in a way that is:</p>
                        <li>Searchable</li>
                        <li>Easy to find quick answers</li>
                        <li>Mobile friendly</li>
                        <br />
                        <p>It is not however:</p>
                        <li>A source of truth</li>
                        <li>A replacement for the ISM</li>
                        <li>Affiliated or connected to the Australian Cyber Security Centre in any way, shape or form. I take no responsibility for the information you find on this site and the <strong><a href='https://cyber.gov.au/ism' target='_blank'>ISM</a></strong> should always be consulted.</li>
                    </div>
                    
                    <div className={styles.card}>
                        <a href='/'>Got it, take me back to the site.</a>
                    </div>
            </main>
        </div>
    )
}