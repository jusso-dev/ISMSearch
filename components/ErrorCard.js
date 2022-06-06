import styles from '../styles/Home.module.css'

export default function ErrorCard(props) {
    return (
        <div className={styles.grid}>
            <div style={{backgroundColor:'red'}} className={styles.card}>
                <p>{props.message}</p>
            </div>
        </div>
    )
}